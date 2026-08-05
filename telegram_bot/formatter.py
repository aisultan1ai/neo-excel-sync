"""Форматирование сделок для отправки в Telegram (HTML parse mode)."""
from datetime import datetime
from html import escape
from typing import Iterable

from config import TELEGRAM_MSG_LIMIT


def _fmt_time_utc(ts: str) -> str:
    """ISO 8601 UTC → 'HH:MM:SS'."""
    if not ts:
        return "—"
    try:
        s = ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.strftime("%H:%M:%S")
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
        pnl_raw = t.get("closedPnl")
        pnl_str = _fmt_pnl(pnl_raw)
        time_str = _fmt_time_utc(t.get("transactTime", ""))

        if pnl_raw is not None:
            try:
                total_pnl += float(pnl_raw)
            except (TypeError, ValueError):
                pass

        block = (
            f"{emoji} <b>{side}</b> <code>{escape(ticker)}</code>\n"
            f"    {amount} × {price}   PnL <b>{pnl_str}</b>   <i>{time_str} UTC</i>"
        )
        trade_blocks.append(block)

    header = (
        f"📊 <b>Сделки за {escape(period)}</b>\n"
        f"Всего: <b>{len(trades)}</b>   Σ PnL: <b>{_fmt_pnl(total_pnl)}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━"
    )

    return _split_messages([header, *trade_blocks])


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
