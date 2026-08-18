import json
import logging
from html import escape
from types import SimpleNamespace

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from api import ApiError
from handlers import require_auth
from strategy_predict.features import compute_features_for_universe, load_features
from strategy_predict.positions import rebuild_positions_fifo
from strategy_predict.analytics import period_report, plot_period
from strategy_predict.pattern import analyze as run_pattern
from strategy_predict.ml import (
    MLNotReady,
    predict_ml as run_predict_ml,
    status as ml_status_fn,
    train as train_ml_fn,
    why_ml as run_why_ml,
)
from strategy_predict.predictor import predict as run_predict
from strategy_predict.predictor import why as run_why
from strategy_predict.reconcile import reconcile_day, scorecard as run_scorecard
from strategy_predict.report import plot_prediction_ranking, plot_scorecard
from strategy_predict.service import ServiceError, sync_trades
from strategy_predict.storage import init_db
from storage import get_scheduler_enabled, set_scheduler_enabled

log = logging.getLogger(__name__)


@require_auth
async def cmd_sync(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    from_date = to_date = None
    if len(args) == 2:
        from_date, to_date = args[0], args[1]
    elif len(args) == 1:
        from_date = to_date = args[0]
    elif len(args) not in (0, 1, 2):
        await update.message.reply_text(
            "Использование: /sync  либо  /sync YYYY-MM-DD  либо  /sync YYYY-MM-DD YYYY-MM-DD"
        )
        return

    status = await update.message.reply_text("⏳ Синхронизирую сделки алго-счёта...")
    try:
        res = await sync_trades(from_date=from_date, to_date=to_date)
    except ServiceError as e:
        await status.edit_text(f"⚠️ {escape(str(e))}")
        return
    except ApiError as e:
        await status.edit_text(f"⚠️ {escape(str(e))}")
        return
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /sync")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    text = (
        "✅ <b>Sync завершён</b>\n"
        f"Счёт: <code>{escape(res['account_id'])}</code>\n"
        f"Период: <b>{res['from_date']} → {res['to_date']}</b>\n"
        f"С биржи получено: <b>{res['fetched']}</b>\n"
        f"Нормализовано: <b>{res['normalized']}</b>  "
        f"(отфильтровано: {res['skipped_norm']})\n"
        f"Записано новых: <b>{res['inserted']}</b>  "
        f"дубликатов: {res['duplicates']}"
    )
    await status.edit_text(text, parse_mode=ParseMode.HTML)


@require_auth
async def cmd_rebuild(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    status = await update.message.reply_text("⏳ Пересобираю позиции (FIFO)...")

    try:
        res = await _run_blocking(rebuild_positions_fifo)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /rebuild")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    tol = max(0.05, abs(res["closed_pnl_from_trades"]) * 1e-6)
    check = "✅ совпадает" if abs(res["pnl_diff"]) < tol else "⚠️ расхождение"
    text = (
        "🧮 <b>Rebuild завершён</b>\n"
        f"Обработано сделок: <b>{res['trades_processed']}</b>\n"
        f"Закрытых позиций: <b>{res['closed_positions']}</b>\n"
        f"Открытых позиций: <b>{res['open_positions']}</b>\n"
        f"Realized PnL (FIFO): <b>{res['realized_pnl_fifo']:.2f}</b>\n"
        f"Σ closedPnL из сделок: <b>{res['closed_pnl_from_trades']:.2f}</b>\n"
        f"Проверка: {check} (Δ={res['pnl_diff']:.4f})"
    )
    await status.edit_text(text, parse_mode=ParseMode.HTML)


@require_auth
async def cmd_predict(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    target_date = args[0].strip() if args else None

    status = await update.message.reply_text(
        f"⏳ Считаю прогноз на {escape(target_date) if target_date else 'ближайший торговый день'}..."
    )

    def _work():
        init_db()
        return run_predict(target_date=target_date)

    try:
        res = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /predict")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    if not res.get("buy") and not res.get("sell"):
        note = res.get("note") or "Нет данных."
        await status.edit_text(f"⚠️ {escape(note)}")
        return

    lines = [
        f"🤖 <b>Прогноз на {escape(res['target_date'])}</b>",
        f"as_of: <code>{escape(res['as_of_date'])}</code>   "
        f"rule: <code>{escape(res['rule_version'])}</code>   "
        f"universe: <b>{res['n_universe']}</b>",
        "",
        "🟢 <b>BUY-кандидаты:</b>",
    ]
    for b in res["buy"]:
        lines.append(
            f"  {b['rank']}. <code>{escape(b['ticker'])}</code>  "
            f"conf=<b>{b['confidence']:.2f}</b>   "
            f"buy={b['buy_score']:.2f}/sell={b['sell_score']:.2f}"
        )
    lines.append("")
    lines.append("🔴 <b>SELL-кандидаты:</b>")
    for s in res["sell"]:
        lines.append(
            f"  {s['rank']}. <code>{escape(s['ticker'])}</code>  "
            f"conf=<b>{s['confidence']:.2f}</b>   "
            f"buy={s['buy_score']:.2f}/sell={s['sell_score']:.2f}"
        )
    lines.append("")
    lines.append(
        "<i>Правило mrv-1.0: ставит на mean-reversion 5d + низкий кросс-секц. ранг + "
        "поправка на режим SPY. Momentum намеренно НЕ используется как сигнал "
        "(приор из истории отрицательный).</i>"
    )

    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)

    try:
        png = await _run_blocking(
            plot_prediction_ranking, res["buy"], res["sell"], res["target_date"]
        )
        await update.message.reply_photo(png, caption=f"Ranking на {res['target_date']}")
    except Exception:  # noqa: BLE001
        log.exception("Не удалось построить график прогноза")


@require_auth
async def cmd_why(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    if not args:
        await update.message.reply_text("Использование: /why TICKER [YYYY-MM-DD]")
        return
    ticker = args[0].upper().strip()
    target_date = args[1].strip() if len(args) >= 2 else None

    def _work():
        init_db()
        return run_why(ticker, target_date)

    try:
        res = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /why")
        await update.message.reply_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    if not res:
        await update.message.reply_text(
            f"⚠️ Нет сохранённого прогноза для <code>{escape(ticker)}</code>"
            + (f" на {escape(target_date)}" if target_date else "")
            + ". Сначала запусти /predict.",
            parse_mode=ParseMode.HTML,
        )
        return

    r = res["rationale"]
    comp = r.get("components", {})
    scores = r.get("scores", {})
    lines = [
        f"🧠 <b>Why {escape(res['ticker'])}</b> — прогноз {escape(res['target_date'])}",
        f"Сторона: <b>{res['side']}</b>   confidence: <b>{res['confidence']:.2f}</b>   "
        f"rank: <b>{res['rank']}</b>",
        f"Rule: <code>{escape(r.get('rule', '?'))}</code>",
        "",
        "<b>Скор:</b>",
        f"  buy=<b>{scores.get('buy', '—')}</b>   sell=<b>{scores.get('sell', '—')}</b>",
        "",
        "<b>Компоненты:</b>",
        f"  cs_rank_ret_5d: <code>{_fmt(comp.get('cs_rank_ret_5d'), 2)}</code>  "
        "<i>← главный сигнал mean-reversion</i>",
        f"  cs_rank_rsi_14: <code>{_fmt(comp.get('cs_rank_rsi_14'), 2)}</code>",
        f"  ma20_dist: <code>{_fmt_pct(comp.get('ma20_dist'))}</code>",
        f"  ret_5d_pctile_60d: <code>{_fmt(comp.get('ret_5d_pctile_60d'), 2)}</code>",
        f"  rsi_14: <code>{_fmt(comp.get('rsi_14'), 1)}</code>",
        f"  SPY выше MA50: <b>{comp.get('spy_above_ma50')}</b>",
    ]
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


@require_auth
async def cmd_reconcile(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    if not args:
        await update.message.reply_text(
            "Использование: /reconcile YYYY-MM-DD\n"
            "Дата — торговый день, для которого уже есть /predict и подтянутые /sync-сделки."
        )
        return
    target_date = args[0].strip()

    status = await update.message.reply_text(
        f"⏳ Сверяю прогноз с фактом на {escape(target_date)}..."
    )

    def _work():
        init_db()
        return reconcile_day(target_date)

    try:
        res = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /reconcile")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    def _fmt_pairs(items: list[dict], empty: str) -> str:
        if not items:
            return f"  <i>{empty}</i>"
        return "\n".join(
            f"  {'🟢' if it['side'] == 'BUY' else '🔴'} <code>{escape(it['ticker'])}</code> "
            f"<i>{it['side']}</i>"
            for it in items
        )

    lines = [
        f"🎯 <b>Reconcile {escape(res['date'])}</b>  "
        f"(rule <code>{escape(res['rule_version'])}</code>)",
        f"Прогнозов: <b>{res['n_predicted']}</b>   "
        f"Реальных: <b>{res['n_actual']}</b>   "
        f"Overlap (по тикеру): <b>{res['n_overlap']}</b>",
        f"Precision: <b>{res['precision']:.2f}</b>   "
        f"Recall: <b>{res['recall']:.2f}</b>   "
        f"F1: <b>{res['f1']:.2f}</b>",
        "",
        "<b>✅ Hits</b> (совпал тикер и side):",
        _fmt_pairs(res["hits"], "нет попаданий"),
        "",
        "<b>❌ Misses</b> (предсказали, не сделали):",
        _fmt_pairs(res["misses"], "нет пропусков"),
        "",
        "<b>➕ Extras</b> (сделали, не предсказали):",
        _fmt_pairs(res["extras"], "нет неожиданных"),
    ]
    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)


@require_auth
async def cmd_scorecard(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    try:
        last_n = int(args[0]) if args else 20
    except ValueError:
        last_n = 20
    last_n = max(1, min(last_n, 200))

    status = await update.message.reply_text(
        f"⏳ Собираю scorecard за последние {last_n} сверок..."
    )

    def _work():
        init_db()
        return run_scorecard(last_n=last_n)

    try:
        res = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /scorecard")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    if res["n_days"] == 0:
        await status.edit_text(
            "⚠️ Ещё нет сверок. Запусти /predict на прошлые дни и /reconcile для них."
        )
        return

    ov = res["overall"]
    lines = [
        f"📊 <b>Scorecard</b> — последних <b>{res['n_days']}</b> сверок",
        "",
        "<b>Микро-агрегаты</b> (по всем предсказаниям — честнее для баланса классов):",
        f"  precision: <b>{ov['micro_precision']:.2f}</b>   "
        f"recall: <b>{ov['micro_recall']:.2f}</b>   "
        f"F1: <b>{ov['micro_f1']:.2f}</b>",
        "",
        "<b>Макро-агрегаты</b> (среднее по дням):",
        f"  precision: <b>{ov['macro_precision']:.2f}</b>   "
        f"recall: <b>{ov['macro_recall']:.2f}</b>   "
        f"F1: <b>{ov['macro_f1']:.2f}</b>",
        "",
        "<b>Топ тикеров</b> (hits / misses / extras):",
    ]
    top_ticks = sorted(
        res["per_ticker"].items(),
        key=lambda kv: -(kv[1]["hits"] + kv[1]["misses"] + kv[1]["extras"]),
    )[:10]
    for t, s in top_ticks:
        lines.append(
            f"  <code>{escape(t)}</code>: ✅ {s['hits']}   ❌ {s['misses']}   ➕ {s['extras']}"
        )

    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)

    try:
        png = await _run_blocking(plot_scorecard, res["history"], res["per_ticker"])
        await update.message.reply_photo(png, caption=f"Scorecard N={res['n_days']}")
    except Exception:  # noqa: BLE001
        log.exception("Не удалось построить график scorecard")


@require_auth
async def cmd_pattern(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    mode = args[0].lower().strip() if args else "entries"
    if mode not in ("entries", "exits"):
        await update.message.reply_text("Использование: /pattern entries | exits")
        return
    side = "BUY" if mode == "entries" else "SELL"

    status = await update.message.reply_text(
        f"⏳ Анализирую распределения фич для {mode} (side={side})..."
    )

    def _work():
        init_db()
        return run_pattern(side=side)

    try:
        rows = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /pattern")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    if not rows:
        await status.edit_text(
            "⚠️ Мало данных для теста. Нужно ≥ 10 сделок с фичами по этой стороне. "
            "Сначала запусти /sync."
        )
        return

    lines = [
        f"🧪 <b>Pattern-анализ: {mode}</b> (side={side})",
        "<i>KS-2samp: сделки алго vs random baseline (p с поправкой Bonferroni)</i>",
        "",
    ]
    for r in rows:
        if r.p_value is None:
            lines.append(
                f"<code>{escape(r.feature):22s}</code> — <i>мало данных</i> "
                f"(n_entries={r.n_entries}, n_bl={r.n_baseline})"
            )
            continue
        marker = "⭐" if r.significant else "·"
        me = f"{r.mean_entries:+.4f}" if r.mean_entries is not None else "—"
        mb = f"{r.mean_baseline:+.4f}" if r.mean_baseline is not None else "—"
        lines.append(
            f"{marker} <code>{escape(r.feature):22s}</code> "
            f"p_bonf=<b>{r.p_value_bonf:.3f}</b>   "
            f"mean: entry={me} vs bl={mb}   <i>{r.direction}</i>"
        )
    lines.append("")
    lines.append(
        "<i>⭐ = p_bonf &lt; 0.05 (различие значимо после поправки на multiple testing). "
        "«·» = НЕзначимо — не выдавать за сигнал.</i>"
    )
    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)


@require_auth
async def cmd_report(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    period = args[0].lower().strip() if args else "week"
    days_map = {"week": 7, "month": 30}
    if period not in days_map:
        await update.message.reply_text("Использование: /report week | month")
        return
    days = days_map[period]

    status = await update.message.reply_text(f"⏳ Собираю отчёт за {period} ({days} дней)...")

    def _work():
        init_db()
        return period_report(days)

    try:
        res = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /report")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    rec = res["reconcile"]
    lines = [
        f"📅 <b>Отчёт {escape(period)}</b> "
        f"({escape(res['from_date'])} → {escape(res['to_date'])})",
        f"Всего сделок: <b>{res['total_trades']}</b>   "
        f"Σ реализ. PnL: <b>{res['total_pnl']:+.2f}</b>",
        "",
        "<b>Топ тикеров:</b>",
    ]
    for t in res["by_ticker"]:
        lines.append(
            f"  <code>{escape(t['ticker'])}</code>  "
            f"trades: <b>{t['n']}</b>   PnL: <b>{(t['pnl'] or 0.0):+.2f}</b>"
        )
    lines.append("")
    if rec["n"]:
        lines.append(
            f"<b>Прогнозы</b>: {rec['n']} сверок в периоде — "
            f"precision <b>{rec['precision']:.2f}</b>   "
            f"recall <b>{rec['recall']:.2f}</b>   "
            f"F1 <b>{rec['f1']:.2f}</b>"
        )
    else:
        lines.append("<i>Сверок в этом периоде пока нет.</i>")

    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)

    try:
        png = await _run_blocking(plot_period, res)
        await update.message.reply_photo(png, caption=f"Дневной PnL — {period}")
    except Exception:  # noqa: BLE001
        log.exception("Не удалось построить график /report")


@require_auth
async def cmd_features(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    if len(args) != 2:
        await update.message.reply_text(
            "Использование: /features TICKER YYYY-MM-DD\n"
            "Пример: /features XLK 2026-08-13"
        )
        return
    ticker = args[0].upper().strip()
    as_of_date = args[1].strip()

    status = await update.message.reply_text(
        f"⏳ Считаю фичи для <code>{escape(ticker)}</code> на {escape(as_of_date)}...",
        parse_mode=ParseMode.HTML,
    )

    def _work():
        init_db()
        compute_features_for_universe(as_of_date)
        return load_features(ticker, as_of_date)

    try:
        payload = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /features")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    if not payload:
        await status.edit_text(
            f"⚠️ Нет данных для <code>{escape(ticker)}</code> на {escape(as_of_date)}. "
            "Проверь, что тикер в вселенной и дата — торговая.",
            parse_mode=ParseMode.HTML,
        )
        return

    lines = [
        f"🔬 <b>Фичи {escape(ticker)}</b> @ <b>{escape(payload['as_of_date'])}</b>",
        f"close: <code>{_fmt(payload.get('close'), 4)}</code>",
        "",
        "<b>Тренд/mean-reversion</b>",
        f"  ret_5d:  <code>{_fmt_pct(payload.get('ret_5d'))}</code>   "
        f"pctile60d: <code>{_fmt(payload.get('ret_5d_pctile_60d'), 2)}</code>",
        f"  ret_20d: <code>{_fmt_pct(payload.get('ret_20d'))}</code>   "
        f"pctile60d: <code>{_fmt(payload.get('ret_20d_pctile_60d'), 2)}</code>",
        f"  RSI(14): <code>{_fmt(payload.get('rsi_14'), 1)}</code>",
        f"  MA20 dist: <code>{_fmt_pct(payload.get('ma20_dist'))}</code>   "
        f"MA50 dist: <code>{_fmt_pct(payload.get('ma50_dist'))}</code>",
        f"  ATR%: <code>{_fmt_pct(payload.get('atr_14_pct'))}</code>   "
        f"vol×20: <code>{_fmt(payload.get('vol_ratio_20'), 2)}</code>",
        f"  overnight gap: <code>{_fmt_pct(payload.get('overnight_gap'))}</code>",
        "",
        "<b>Кросс-секц. ранг по вселенной</b> (0=хуже всех, 1=лучше)",
        f"  ret_5d rank:  <code>{_fmt(payload.get('cs_rank_ret_5d'), 2)}</code>",
        f"  ret_20d rank: <code>{_fmt(payload.get('cs_rank_ret_20d'), 2)}</code>",
        f"  RSI rank:     <code>{_fmt(payload.get('cs_rank_rsi_14'), 2)}</code>",
        "",
        "<b>Режим рынка (SPY)</b>",
        f"  SPY &gt; MA50: <b>{payload.get('spy_above_ma50')}</b>   "
        f"SPY &gt; MA200: <b>{payload.get('spy_above_ma200')}</b>",
        f"  SPY ret_5d: <code>{_fmt_pct(payload.get('spy_ret_5d'))}</code>   "
        f"ret_20d: <code>{_fmt_pct(payload.get('spy_ret_20d'))}</code>",
    ]
    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)


def _fmt(x, digits: int = 4) -> str:
    if x is None:
        return "—"
    try:
        return f"{float(x):.{digits}f}"
    except (TypeError, ValueError):
        return str(x)


def _fmt_pct(x) -> str:
    if x is None:
        return "—"
    try:
        return f"{float(x) * 100:+.2f}%"
    except (TypeError, ValueError):
        return str(x)


@require_auth
async def cmd_scheduler(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    action = args[0].lower().strip() if args else "status"

    if action == "on":
        set_scheduler_enabled(True)
        enabled = True
    elif action == "off":
        set_scheduler_enabled(False)
        enabled = False
    elif action == "status":
        enabled = get_scheduler_enabled()
    else:
        await update.message.reply_text(
            "Использование: /scheduler on | off | status"
        )
        return

    state = "▶️ <b>включён</b>" if enabled else "⏸ <b>выключен</b>"
    text = (
        f"🕒 Scheduler: {state}\n"
        f"Расписание: daily 23:15 UTC (sync+reconcile+predict), "
        f"weekly ВС 03:00 UTC (train_ml)."
    )
    if not enabled:
        text += "\n\n<i>Пока выключен — auto-jobs скипаются. Ручные /sync, /predict, /train_ml работают как обычно.</i>"
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


@require_auth
async def cmd_ml_status(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    def _work():
        init_db()
        return ml_status_fn()

    try:
        rd = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /ml_status")
        await update.message.reply_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    gate = "✅ готов" if rd.ready else "⛔ пока нет"
    lines = [
        f"🧠 <b>ML этап C — статус</b>",
        f"Gate: <b>{gate}</b>   <i>{escape(rd.reason)}</i>",
        f"Сверок в базе: <b>{rd.n_reconciliations}</b> "
        f"(нужно ≥ <b>{rd.min_required}</b>)",
        f"Сделок для обучения: BUY=<b>{rd.n_buy_positive}</b>, "
        f"SELL=<b>{rd.n_sell_positive}</b>",
        "",
        "<b>Обученные модели:</b>",
    ]
    for side, meta in (("BUY", rd.trained_buy), ("SELL", rd.trained_sell)):
        if not meta:
            lines.append(f"  {side}: <i>не обучена</i>")
            continue
        m = json.loads(meta["metrics_json"] or "{}")
        lines.append(
            f"  {side}: <b>{escape(meta['model_version'])}</b>  "
            f"обучена <code>{escape(meta['trained_at'][:19])}</code>  "
            f"n_train={meta['n_train']}  n_pos={meta['n_positive']}  "
            f"acc={m.get('accuracy', '—')}  f1={m.get('f1', '—')}"
        )
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


@require_auth
async def cmd_train_ml(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    status = await update.message.reply_text("⏳ Обучаю XGBoost (BUY + SELL)...")

    def _work():
        init_db()
        results = {}
        for side in ("BUY", "SELL"):
            try:
                results[side] = train_ml_fn(side)
            except MLNotReady as e:
                results[side] = {"error": str(e)}
        return results

    try:
        res = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /train_ml")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    lines = ["🎓 <b>Обучение ML</b>"]
    for side in ("BUY", "SELL"):
        r = res[side]
        if "error" in r:
            lines.append(f"  {side}: ⛔ {escape(r['error'])}")
        else:
            m = r["metrics"]
            lines.append(
                f"  {side}: ✅ <b>{escape(r['model_version'])}</b>  "
                f"n_train={r['n_train']}  n_pos={r['n_positive']}  "
                f"acc={m.get('accuracy', '—')}  f1={m.get('f1', '—')}  "
                f"auc={m.get('roc_auc', '—')}"
            )
    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)


@require_auth
async def cmd_predict_ml(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    target_date = args[0].strip() if args else None

    status = await update.message.reply_text(
        f"⏳ ML-прогноз на {escape(target_date) if target_date else 'ближайший торговый день'}..."
    )

    def _work():
        init_db()
        return run_predict_ml(target_date=target_date)

    try:
        res = await _run_blocking(_work)
    except MLNotReady as e:
        await status.edit_text(f"⛔ {escape(str(e))}")
        return
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /predict_ml")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    if not res.get("buy") and not res.get("sell"):
        await status.edit_text(f"⚠️ {escape(res.get('note') or 'нет данных')}")
        return

    lines = [
        f"🤖 <b>ML-прогноз на {escape(res['target_date'])}</b>",
        f"as_of: <code>{escape(res['as_of_date'])}</code>   "
        f"model: <code>{escape(res['model_version'])}</code>   "
        f"universe: <b>{res['n_universe']}</b>",
        "",
        "🟢 <b>BUY-кандидаты (по вероятности):</b>",
    ]
    for b in res["buy"]:
        lines.append(f"  {b['rank']}. <code>{escape(b['ticker'])}</code>  "
                     f"P=<b>{b['confidence']:.3f}</b>")
    lines.append("")
    lines.append("🔴 <b>SELL-кандидаты:</b>")
    for s in res["sell"]:
        lines.append(f"  {s['rank']}. <code>{escape(s['ticker'])}</code>  "
                     f"P=<b>{s['confidence']:.3f}</b>")
    await status.edit_text("\n".join(lines), parse_mode=ParseMode.HTML)


@require_auth
async def cmd_why_ml(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    if not args:
        await update.message.reply_text("Использование: /why_ml TICKER [YYYY-MM-DD]")
        return
    ticker = args[0].upper().strip()
    target_date = args[1].strip() if len(args) >= 2 else None

    def _work():
        init_db()
        return run_why_ml(ticker, target_date)

    try:
        res = await _run_blocking(_work)
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка в /why_ml")
        await update.message.reply_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    if "error" in res:
        await update.message.reply_text(f"⚠️ {escape(res['error'])}")
        return

    lines = [
        f"🔎 <b>SHAP для {escape(res['ticker'])}</b> на {escape(res['target_date'])}",
        f"as_of: <code>{escape(res['as_of_date'])}</code>",
        "",
    ]
    for side, block in res["sides"].items():
        if "error" in block:
            lines.append(f"<b>{side}</b>: ⛔ {escape(block['error'])}")
            lines.append("")
            continue
        lines.append(f"<b>{side}</b>   P=<b>{block['probability']:.3f}</b>")
        for f in block["top_features"]:
            arrow = "↑" if f["shap"] >= 0 else "↓"
            lines.append(
                f"  {arrow} <code>{escape(f['name']):22s}</code> "
                f"value=<code>{_fmt(f['value'], 4)}</code>  "
                f"shap=<b>{f['shap']:+.3f}</b>"
            )
        lines.append("")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


@require_auth
async def on_predict_button(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    from datetime import date, timedelta

    q = update.callback_query
    await q.answer()
    data = q.data or ""

    if data == "scheduler_toggle":
        new_state = not get_scheduler_enabled()
        set_scheduler_enabled(new_state)
        ctx.args = ["status"]
        handler = cmd_scheduler
        args = ["status"]
    else:
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        routes = {
            "sync_today":          (cmd_sync, []),
            "rebuild_run":         (cmd_rebuild, []),
            "predict_run":         (cmd_predict, []),
            "predict_ml_run":      (cmd_predict_ml, []),
            "reconcile_yesterday": (cmd_reconcile, [yesterday]),
            "scorecard_show":      (cmd_scorecard, []),
            "report_week":         (cmd_report, ["week"]),
            "report_month":        (cmd_report, ["month"]),
            "pattern_entries":     (cmd_pattern, ["entries"]),
            "pattern_exits":       (cmd_pattern, ["exits"]),
            "ml_status_show":      (cmd_ml_status, []),
            "ml_train_run":        (cmd_train_ml, []),
        }
        if data not in routes:
            return
        handler, args = routes[data]
        ctx.args = args

    fake_update = SimpleNamespace(
        update_id=update.update_id,
        message=q.message,
        callback_query=None,
        effective_user=update.effective_user,
        effective_chat=update.effective_chat,
    )
    await handler(fake_update, ctx)


async def _run_blocking(fn, *args, **kwargs):
    import asyncio
    return await asyncio.get_running_loop().run_in_executor(
        None, lambda: fn(*args, **kwargs)
    )
