import logging
import os
from datetime import date, time as dt_time, timezone

from telegram.ext import Application, ContextTypes

from storage import get_scheduler_enabled

from .ml import MLNotReady, status as ml_status, train as ml_train
from .predictor import predict as run_predict
from .reconcile import reconcile_day
from .service import ServiceError, sync_trades
from .storage import init_db

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
    try:
        rec = reconcile_day(today)
        rec_f1 = rec["f1"]
        log.info("scheduler: reconcile %s — predicted=%d actual=%d F1=%.2f",
                 today, rec["n_predicted"], rec["n_actual"], rec["f1"])
    except Exception:  # noqa: BLE001
        log.exception("scheduler: reconcile failed")

    pred_target = None
    try:
        pred = run_predict()
        pred_target = pred["target_date"]
        log.info("scheduler: predict → target=%s buy=%d sell=%d",
                 pred["target_date"], len(pred["buy"]), len(pred["sell"]))
    except Exception:  # noqa: BLE001
        log.exception("scheduler: predict failed")

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
    for side in ("BUY", "SELL"):
        try:
            res = ml_train(side)
            m = res["metrics"]
            log.info("scheduler: trained %s n_train=%d n_pos=%d metrics=%s",
                     side, res["n_train"], res["n_positive"], m)
            lines.append(
                f"{side}: ✅ n_train={res['n_train']} n_pos={res['n_positive']} "
                f"acc={m.get('accuracy', '—')} f1={m.get('f1', '—')}"
            )
        except MLNotReady as e:
            log.info("scheduler: skip train %s — %s", side, e)
            lines.append(f"{side}: ⛔ {e}")
        except Exception as e:  # noqa: BLE001
            log.exception("scheduler: train %s failed", side)
            lines.append(f"{side}: ⚠️ {type(e).__name__}")

    await _notify(ctx, "🎓 Weekly train_ml:\n" + "\n".join(lines))


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
    log.info(
        "scheduler: daily 23:15 UTC (sync+reconcile+predict); "
        "weekly ВС 03:00 UTC (train_ml)"
    )
