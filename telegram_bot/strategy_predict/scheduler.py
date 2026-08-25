import logging
import os
from datetime import date, time as dt_time, timezone

from telegram.ext import Application, ContextTypes

from storage import get_scheduler_enabled

from .drift import compute_drift, has_alert
from .ml import (
    MLNotReady,
    MODEL_VERSION as ML_MODEL_VERSION_DEFAULT,
    MODEL_VERSION_V2 as ML_MODEL_VERSION_V2,
    predict_ml,
    predict_ml_shadow,
    status as ml_status,
    train as ml_train,
)
from .predictor import predict as run_predict
from .reconcile import reconcile_day
from .service import ServiceError, sync_trades
from .storage import init_db


def _primary_version() -> str:
    return os.environ.get("ML_MODEL_VERSION", ML_MODEL_VERSION_DEFAULT).strip() or ML_MODEL_VERSION_DEFAULT


def _shadow_versions() -> tuple[str, ...]:
    raw = os.environ.get("ML_SHADOW_VERSIONS", ML_MODEL_VERSION_V2).strip()
    if not raw:
        return ()
    primary = _primary_version()
    return tuple(v.strip() for v in raw.split(",") if v.strip() and v.strip() != primary)


def _versions_to_train() -> tuple[str, ...]:
    primary = _primary_version()
    seen = {primary}
    out = [primary]
    for v in _shadow_versions():
        if v not in seen:
            out.append(v); seen.add(v)
    return tuple(out)

log = logging.getLogger(__name__)


def _admin_chat_id() -> int | None:
    raw = os.environ.get("SCHEDULER_ADMIN_CHAT_ID")
    if not raw:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        return None


async def _notify(ctx: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    chat_id = _admin_chat_id()
    if not chat_id:
        return
    try:
        await ctx.bot.send_message(chat_id, text)
    except Exception:  # noqa: BLE001
        log.exception("scheduler: notify failed")


async def _job_daily(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not get_scheduler_enabled():
        log.info("scheduler: daily job skipped — scheduler отключён (/scheduler on)")
        return

    today_dt = date.today()
    if today_dt.weekday() >= 5:
        log.info("scheduler: daily job skipped — %s выходной", today_dt)
        return

    log.info("scheduler: daily job started")
    init_db()

    inserted = 0
    try:
        res = await sync_trades()
        inserted = res.get("inserted", 0)
        log.info("scheduler: sync — inserted=%d duplicates=%d",
                 inserted, res.get("duplicates", 0))
    except ServiceError as e:
        log.warning("scheduler: sync skipped — %s", e)
    except Exception:  # noqa: BLE001
        log.exception("scheduler: sync failed")

    today = date.today().isoformat()
    rec_f1 = None
    # reconcile для rule-based mrv-1.0 + всех ML версий (primary + shadow)
    rule_versions = ["mrv-1.0", _primary_version(), *_shadow_versions()]
    rule_versions = list(dict.fromkeys(rule_versions))  # dedupe, сохраняем порядок
    for rv in rule_versions:
        try:
            rec = reconcile_day(today, rule_version=rv)
            log.info("scheduler: reconcile %s (%s) — predicted=%d actual=%d F1=%.2f",
                     today, rv, rec["n_predicted"], rec["n_actual"], rec["f1"])
            if rv == "mrv-1.0":
                rec_f1 = rec["f1"]
        except Exception:  # noqa: BLE001
            log.exception("scheduler: reconcile (%s) failed", rv)

    pred_target = None
    try:
        pred = run_predict()
        pred_target = pred["target_date"]
        log.info("scheduler: predict → target=%s buy=%d sell=%d",
                 pred["target_date"], len(pred["buy"]), len(pred["sell"]))
    except Exception:  # noqa: BLE001
        log.exception("scheduler: predict failed")

    # ML predict — primary + shadow (для сбора precision@5-per-day в БД)
    primary = _primary_version()
    shadows = _shadow_versions()
    try:
        ml_res = predict_ml(model_version=primary)
        log.info("scheduler: ml_predict (%s) buy=%d sell=%d",
                 primary, len(ml_res.get("buy", [])), len(ml_res.get("sell", [])))
    except MLNotReady as e:
        log.info("scheduler: ml_predict (%s) пропущен — %s", primary, e)
    except Exception:  # noqa: BLE001
        log.exception("scheduler: ml_predict failed")

    if shadows:
        try:
            predict_ml_shadow(shadow_versions=shadows)
            log.info("scheduler: ml_predict shadow пройден — %s", shadows)
        except Exception:  # noqa: BLE001
            log.exception("scheduler: ml_predict shadow failed")

    rec_f1_str = f"{rec_f1:.2f}" if rec_f1 is not None else "—"
    await _notify(
        ctx,
        f"🕒 Daily job: sync +{inserted} trades; "
        f"reconcile {today} F1={rec_f1_str}; "
        f"predict → {pred_target or '—'}"
    )


async def _job_weekly_train(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not get_scheduler_enabled():
        log.info("scheduler: weekly train skipped — scheduler отключён (/scheduler on)")
        return

    log.info("scheduler: weekly train job started")
    init_db()
    rd = ml_status()
    if not rd.ready:
        log.info("scheduler: train_ml пропущен — %s", rd.reason)
        await _notify(ctx, f"🎓 train_ml: пропущено ({rd.reason})")
        return

    lines: list[str] = []
    for ver in _versions_to_train():
        lines.append(f"— {ver} —")
        for side in ("BUY", "SELL"):
            try:
                res = ml_train(side, model_version=ver)
                m = res["metrics"]
                log.info("scheduler: trained %s (%s) n_train=%d n_pos=%d metrics=%s",
                         side, ver, res["n_train"], res["n_positive"], m)
                lines.append(
                    f"{side}: ✅ n_train={res['n_train']} n_pos={res['n_positive']} "
                    f"P@{m.get('top_k', 5)}={m.get('precision_at_k_mean', '—')} "
                    f"PR-AUC={m.get('pr_auc_mean', '—')}"
                )
            except MLNotReady as e:
                log.info("scheduler: skip train %s (%s) — %s", side, ver, e)
                lines.append(f"{side}: ⛔ {e}")
            except Exception as e:  # noqa: BLE001
                log.exception("scheduler: train %s (%s) failed", side, ver)
                lines.append(f"{side}: ⚠️ {type(e).__name__}")

    await _notify(ctx, "🎓 Weekly train_ml:\n" + "\n".join(lines))


async def _job_weekly_drift(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not get_scheduler_enabled():
        return
    init_db()
    try:
        drifts = compute_drift()
    except Exception:  # noqa: BLE001
        log.exception("scheduler: drift compute failed")
        return
    alerts = [d for d in drifts if d.status == "alert"]
    watches = [d for d in drifts if d.status == "watch"]
    log.info("scheduler: drift — %d alerts, %d watches", len(alerts), len(watches))
    if has_alert(drifts):
        top_alerts = sorted(alerts, key=lambda d: -(d.psi or 0))[:5]
        msg = "🔴 <b>Feature drift alert</b>\n" + "\n".join(
            f"• {d.feature}: PSI={d.psi:.3f}" for d in top_alerts
        ) + "\n\nСтоит запустить /train_ml — распределения фич сместились."
        await _notify(ctx, msg)


def register_jobs(app: Application) -> None:
    jq = getattr(app, "job_queue", None)
    if jq is None:
        log.warning(
            "scheduler: job_queue отсутствует — "
            "нужен python-telegram-bot[job-queue] в requirements"
        )
        return

    jq.run_daily(
        _job_daily,
        time=dt_time(23, 15, tzinfo=timezone.utc),
        name="predict_daily",
    )
    jq.run_daily(
        _job_weekly_train,
        time=dt_time(3, 0, tzinfo=timezone.utc),
        days=(6,),
        name="predict_weekly_train",
    )
    jq.run_daily(
        _job_weekly_drift,
        time=dt_time(4, 0, tzinfo=timezone.utc),
        days=(0,),  # понедельник
        name="predict_weekly_drift",
    )
    log.info(
        "scheduler: daily 23:15 UTC (sync+reconcile+predict); "
        "weekly ВС 03:00 UTC (train_ml); "
        "weekly ПН 04:00 UTC (drift check)"
    )
