"""Форматирование сделок для отправки в Telegram (HTML parse mode)."""
from datetime import datetime, timezone, timedelta
from html import escape
from typing import Iterable

from config import TELEGRAM_MSG_LIMIT

# Смещение отображаемого времени: UTC+5
DISPLAY_TZ = timezone(timedelta(hours=5))
DISPLAY_TZ_LABEL = "UTC+5"


def _fmt_time(ts: str) -> str:
    """ISO 8601 UTC → 'HH:MM:SS' в зоне DISPLAY_TZ."""
    if not ts:
        return "—"
    try:
        s = ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        # Если у даты не указан tz — считаем что это UTC (Unity отдаёт UTC)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(DISPLAY_TZ).strftime("%H:%M:%S")
    except (ValueError, TypeError):
        return ts


def _fmt_num(x, digits: int = 4) -> str:
    if x is None:
        return "—"
    try:
        return f"{float(x):.{digits}f}"
    except (TypeError, ValueError):
        return str(x)


def _fmt_pnl(x) -> str:
    if x is None:
        return "—"
    try:
        v = float(x)
    except (TypeError, ValueError):
        return str(x)
    sign = "+" if v >= 0 else ""
    return f"{sign}{v:.2f}"


def format_trades(
    trades: list[dict],
    from_date: str,
    to_date: str,
    instruments_map: dict[int, str] | None = None,
) -> list[str]:
    """
    Собрать сообщения в HTML-разметке.
    Возвращает список готовых текстов ≤ TELEGRAM_MSG_LIMIT символов.
    """
    instruments_map = instruments_map or {}
    period = from_date if from_date == to_date else f"{from_date} — {to_date}"

    if not trades:
        return [f"📭 Сделок за <b>{escape(period)}</b> не найдено."]

    total_pnl = 0.0
    trade_blocks: list[str] = []

    for t in trades:
        side = t.get("side") or "?"
        emoji = "🟢" if side == "BUY" else "🔴" if side == "SELL" else "⚪️"
        instr_id = t.get("instrumentId")
        ticker = instruments_map.get(int(instr_id), str(instr_id)) if instr_id is not None else "—"

        amount = _fmt_num(t.get("amount"))
        price = _fmt_num(t.get("price"))
        quote_amount = _fmt_num(t.get("quoteAmount"), digits=2)
        pnl_raw = t.get("closedPnl")
        pnl_str = _fmt_pnl(pnl_raw)
        time_str = _fmt_time(t.get("transactTime", ""))

        if pnl_raw is not None:
            try:
                total_pnl += float(pnl_raw)
            except (TypeError, ValueError):
                pass

        block = (
            f"{emoji} <b>{side}</b> <code>{escape(ticker)}</code>\n"
            f"    {amount} × {price} = {quote_amount}\n"
            f"    PnL <b>{pnl_str}</b>   <i>{time_str} {DISPLAY_TZ_LABEL}</i>"
        )
        trade_blocks.append(block)

    header = (
        f"📊 <b>Сделки за {escape(period)}</b>\n"
        f"Всего: <b>{len(trades)}</b>   Σ PnL: <b>{_fmt_pnl(total_pnl)}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━"
    )

    return _split_messages([header, *trade_blocks])


def format_positions(
    positions: list[dict],
    instruments_map: dict[int, str] | None = None,
) -> list[str]:
    """Собрать сообщения по открытым позициям в HTML."""
    instruments_map = instruments_map or {}

    if not positions:
        return ["📭 Открытых позиций нет."]

    def _sum(field: str) -> float:
        total = 0.0
        for p in positions:
            v = p.get(field)
            if v is None:
                continue
            try:
                total += float(v)
            except (TypeError, ValueError):
                pass
        return total

    total_mv = _sum("convertedMarketValue")
    total_unreal = _sum("unrealizedConvertedPnL")
    total_real = _sum("realizedConvertedPnL")
    total_pnl = _sum("totalConvertedPnL")

    header = (
        f"📈 <b>Открытых позиций: {len(positions)}</b>\n"
        f"Стоимость: <b>{_fmt_num(total_mv, 2)}</b>\n"
        f"Unrealized: <b>{_fmt_pnl(total_unreal)}</b>   "
        f"Realized: <b>{_fmt_pnl(total_real)}</b>\n"
        f"Total PnL: <b>{_fmt_pnl(total_pnl)}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━"
    )

    blocks: list[str] = []
    for p in positions:
        instr_id = p.get("instrumentId")
        ticker = (
            instruments_map.get(int(instr_id), str(instr_id))
            if instr_id is not None else "—"
        )
        amount = p.get("amount")
        try:
            amount_f = float(amount) if amount is not None else 0.0
        except (TypeError, ValueError):
            amount_f = 0.0
        side_emoji = "🟢" if amount_f > 0 else "🔴" if amount_f < 0 else "⚪️"
        side_label = "LONG" if amount_f > 0 else "SHORT" if amount_f < 0 else "—"

        avp = _fmt_num(p.get("avp"), 4)
        mv = _fmt_num(p.get("convertedMarketValue"), 2)
        unreal = _fmt_pnl(p.get("unrealizedConvertedPnL"))
        real = _fmt_pnl(p.get("realizedConvertedPnL"))
        total_p = _fmt_pnl(p.get("totalConvertedPnL"))
        open_date = p.get("openDate") or "—"

        block = (
            f"{side_emoji} <b>{side_label}</b> <code>{escape(ticker)}</code>   "
            f"<i>с {escape(open_date)}</i>\n"
            f"    Кол-во: {amount}   Средняя: {avp}\n"
            f"    Стоимость: {mv}\n"
            f"    Unrealized: <b>{unreal}</b>   Realized: <b>{real}</b>\n"
            f"    Total PnL: <b>{total_p}</b>"
        )
        blocks.append(block)

    return _split_messages([header, *blocks])


def _split_messages(parts: Iterable[str]) -> list[str]:
    """
    Склеить куски (заголовок + блоки сделок) в сообщения не длиннее TELEGRAM_MSG_LIMIT.
    Каждый блок отделяется пустой строкой.
    """
    messages: list[str] = []
    buf: list[str] = []
    buf_len = 0
    sep = "\n\n"

    for part in parts:
        add_len = len(part) + (len(sep) if buf else 0)
        if buf and buf_len + add_len > TELEGRAM_MSG_LIMIT:
            messages.append(sep.join(buf))
            buf = [part]
            buf_len = len(part)
        else:
            buf.append(part)
            buf_len += add_len

    if buf:
        messages.append(sep.join(buf))

    # На случай если одна часть > лимита — жёстко режем
    result: list[str] = []
    for m in messages:
        if len(m) <= TELEGRAM_MSG_LIMIT:
            result.append(m)
        else:
            for i in range(0, len(m), TELEGRAM_MSG_LIMIT):
                result.append(m[i:i + TELEGRAM_MSG_LIMIT])
    return result
