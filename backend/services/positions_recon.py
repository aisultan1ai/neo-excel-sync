"""Сверка позиций: фактические позиции Unity vs сумма DIRECT-сделок."""
import logging
from decimal import Decimal

from services import unity

log = logging.getLogger(__name__)

USD_ASSET_ID = 1
HISTORY_FLOOR = "2023-01-01"   # раньше этой даты счетов практически нет

STATUS_OK = "OK"
STATUS_MISMATCH = "MISMATCH"        # позиция есть, но размер не совпадает
STATUS_MISSING = "MISSING"          # по сделкам позиция должна быть, на счёте её нет
STATUS_UNEXPECTED = "UNEXPECTED"    # на счёте позиция есть, по сделкам её быть не должно

_STATUS_ORDER = {STATUS_MISSING: 0, STATUS_MISMATCH: 1, STATUS_UNEXPECTED: 2, STATUS_OK: 3}


def _dec(v) -> Decimal:
    if v is None or v == "":
        return Decimal(0)
    return Decimal(str(v))


def _num(d: Decimal) -> float:
    return float(d) if d else 0.0


def _status(expected: Decimal, actual: Decimal) -> str:
    if expected == actual:
        return STATUS_OK
    if actual == 0:
        return STATUS_MISSING
    if expected == 0:
        return STATUS_UNEXPECTED
    return STATUS_MISMATCH


def _history_start(account: dict | None) -> tuple[str, str]:
    """Начало истории: дата открытия счёта, но не раньше HISTORY_FLOOR."""
    open_date = str((account or {}).get("openDate") or "")[:10]
    if open_date > HISTORY_FLOOR:
        return open_date, "account_open_date"
    return HISTORY_FLOOR, "history_floor"


def reconcile_account(
    base_url: str, token: str, account_id: str,
    from_date: str | None, to_date: str, account: dict | None = None,
) -> dict:
    positions = unity.get_account_positions(base_url, token, account_id, USD_ASSET_ID)
    if from_date:
        period_source = "user"
    else:
        from_date, period_source = _history_start(account)
    if from_date > to_date:
        from_date = to_date
    trades = unity.get_trades(base_url, token, account_id, from_date, to_date, "DIRECT")

    by_instr: dict = {}

    def bucket(instr_id):
        return by_instr.setdefault(instr_id, {
            "expected": Decimal(0), "buy": Decimal(0), "sell": Decimal(0),
            "actual": Decimal(0), "positions": [], "trades": [],
        })

    for t in trades:
        b = bucket(t.get("instrumentId"))
        qty = abs(_dec(t.get("amount")))
        side = str(t.get("side") or "").upper()
        if side == "BUY":
            b["expected"] += qty
            b["buy"] += qty
        elif side == "SELL":
            b["expected"] -= qty
            b["sell"] += qty
        else:
            log.warning("Сделка %s: неизвестная сторона %r", t.get("id"), side)
        b["trades"].append({
            "id": t.get("id"),
            "trade_date": t.get("tradeDate"),
            "transact_time": t.get("transactTime"),
            "side": side,
            "amount": _num(qty),
            "price": t.get("price"),
            "quote_amount": t.get("quoteAmount"),
            "position_id": t.get("positionId"),
            "order_id": t.get("orderId"),
            "comment": t.get("comment"),
        })

    for p in positions:
        b = bucket(p.get("instrumentId"))
        b["actual"] += _dec(p.get("amount"))
        b["positions"].append({
            "position_id": p.get("positionId"),
            "open_date": p.get("openDate"),
            "amount": p.get("amount"),
            "notional_amount": p.get("notionalAmount"),
            "avp": p.get("avp"),
            "market_value_usd": p.get("convertedMarketValue"),
            "hedge": p.get("hedge"),
        })

    instruments = unity.get_instrument_details(base_url, token, list(by_instr.keys()))

    rows = []
    for instr_id, b in by_instr.items():
        info = instruments.get(instr_id) or {}
        rows.append({
            "instrument_id": instr_id,
            "ticker": info.get("ticker") or f"#{instr_id}",
            "code": info.get("code"),
            "name": info.get("name"),
            "category": info.get("category"),
            "isin": info.get("isin"),
            "lot_size": info.get("lotSize"),
            "expected": _num(b["expected"]),
            "actual": _num(b["actual"]),
            "diff": _num(b["actual"] - b["expected"]),
            "buy_qty": _num(b["buy"]),
            "sell_qty": _num(b["sell"]),
            "trades_count": len(b["trades"]),
            "status": _status(b["expected"], b["actual"]),
            "positions": b["positions"],
            "trades": b["trades"],
        })

    rows.sort(key=lambda r: (_STATUS_ORDER[r["status"]], r["ticker"]))

    summary = {s: 0 for s in _STATUS_ORDER}
    for r in rows:
        summary[r["status"]] += 1

    return {
        "account_id": account_id,
        "from_date": from_date,
        "to_date": to_date,
        "period_source": period_source,
        "positions_count": len(positions),
        "trades_count": len(trades),
        "summary": summary,
        "rows": rows,
    }
