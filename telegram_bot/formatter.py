"""Форматирование сделок для отправки в Telegram."""
from datetime import datetime
from typing import Iterable

from config import TELEGRAM_MSG_LIMIT


def _fmt_time_utc(ts: str) -> str:
    """ISO 8601 (например '2026-08-05T14:23:45.123Z') → 'YYYY-MM-DD HH:MM:SS UTC'."""
    if not ts:
        return "—"
    try:
        s = ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, TypeError):
        return ts


def _fmt_num(x, digits: int = 4) -> str:
    if x is None:
        return "—"
    try:
        return f"{float(x):.{digits}f}"
    except (TypeError, ValueError):
        return str(x)


def format_trades(trades: list[dict], from_date: str, to_date: str) -> list[str]:
    """
    Собрать список сделок в одно или несколько сообщений,
    каждое короче TELEGRAM_MSG_LIMIT символов.
    """
    period = from_date if from_date == to_date else f"{from_date} — {to_date}"

    if not trades:
        return [f"📭 Сделок за {period} не найдено."]

    total_pnl = 0.0
    lines: list[str] = []

    for t in trades:
        side = t.get("side") or "?"
        emoji = "🟢" if side == "BUY" else "🔴" if side == "SELL" else "⚪️"
        instrument = t.get("instrumentId") or "—"
        amount = _fmt_num(t.get("amount"))
        price = _fmt_num(t.get("price"))
        pnl_raw = t.get("closedPnl")
        pnl_str = _fmt_num(pnl_raw, digits=2) if pnl_raw is not None else "—"
        time_str = _fmt_time_utc(t.get("transactTime", ""))

        if pnl_raw is not None:
            try:
                total_pnl += float(pnl_raw)
            except (TypeError, ValueError):
                pass

        lines.append(
            f"{emoji} {side} {instrument} | qty {amount} @ {price}"
            f" | PnL {pnl_str} | {time_str}"
        )

    header = (
        f"📊 Сделки за {period}\n"
        f"Всего сделок: {len(trades)}   Σ PnL: {total_pnl:.2f}\n"
        f"{'─' * 30}"
    )

    return _split_messages([header, *lines])


def _split_messages(lines: Iterable[str]) -> list[str]:
    """Склеить строки в сообщения не длиннее TELEGRAM_MSG_LIMIT."""
    messages: list[str] = []
    buf: list[str] = []
    buf_len = 0

    for line in lines:
        # +1 на перенос строки
        add_len = len(line) + (1 if buf else 0)
        if buf and buf_len + add_len > TELEGRAM_MSG_LIMIT:
            messages.append("\n".join(buf))
            buf = [line]
            buf_len = len(line)
        else:
            buf.append(line)
            buf_len += add_len

    if buf:
        messages.append("\n".join(buf))

    # На случай если одна строка > лимита — жёстко режем
    result: list[str] = []
    for m in messages:
        if len(m) <= TELEGRAM_MSG_LIMIT:
            result.append(m)
        else:
            for i in range(0, len(m), TELEGRAM_MSG_LIMIT):
                result.append(m[i:i + TELEGRAM_MSG_LIMIT])
    return result
