import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from .storage import get_conn

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TradeDTO:
    execution_id: str
    trade_id: str | None
    account_id: str
    instrument_id: int | None
    ticker: str
    side: str
    amount: float
    price: float
    quote_amount: float | None
    commission: float | None
    closed_pnl: float | None
    transact_time: str
    trade_date: str
    source: str = "unity_api"


def _to_float(x) -> float | None:
    if x is None or x == "" or x == "-":
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _iso_utc(ts: str | None) -> str | None:
    if not ts:
        return None
    try:
        s = ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError):
        return ts


def normalize_from_unity(
    item: dict,
    ticker_map: dict[int, str],
    fallback_account_id: str | None = None,
) -> TradeDTO | None:
    execution_id = str(
        item.get("executionId")
        or item.get("execution_id")
        or item.get("id")
        or ""
    ).strip()
    if not execution_id:
        return None

    side = (item.get("side") or "").upper()
    if side not in ("BUY", "SELL"):
        return None

    instr_id_raw = item.get("instrumentId")
    instrument_id: int | None
    try:
        instrument_id = int(instr_id_raw) if instr_id_raw is not None else None
    except (TypeError, ValueError):
        instrument_id = None

    ticker = ""
    if instrument_id is not None and instrument_id in ticker_map:
        ticker = ticker_map[instrument_id]
    if not ticker:
        return None

    price = _to_float(item.get("price"))
    amount_raw = _to_float(item.get("amount"))
    if price is None or amount_raw is None:
        return None

    amount = abs(amount_raw) if side == "BUY" else -abs(amount_raw)

    account_id = str(item.get("accountId") or fallback_account_id or "").strip()
    if not account_id:
        return None

    transact_time = _iso_utc(item.get("transactTime")) or ""
    trade_date = item.get("tradeDate") or (transact_time[:10] if transact_time else "")

    return TradeDTO(
        execution_id=execution_id,
        trade_id=str(item.get("id")) if item.get("id") is not None else None,
        account_id=account_id,
        instrument_id=instrument_id,
        ticker=ticker,
        side=side,
        amount=amount,
        price=price,
        quote_amount=_to_float(item.get("quoteAmount")),
        commission=_to_float(item.get("commission")),
        closed_pnl=_to_float(item.get("closedPnl")),
        transact_time=transact_time,
        trade_date=trade_date,
    )


def upsert_trades(trades: list[TradeDTO], raw_items: list[dict] | None = None) -> tuple[int, int]:
    if not trades:
        return 0, 0

    raw_by_exec: dict[str, dict] = {}
    if raw_items:
        for it in raw_items:
            eid = str(it.get("executionId") or it.get("execution_id") or "").strip()
            if eid:
                raw_by_exec[eid] = it

    inserted = 0
    skipped = 0
    with get_conn() as conn:
        for t in trades:
            raw_json = json.dumps(raw_by_exec.get(t.execution_id), ensure_ascii=False) \
                if raw_by_exec else None
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO trades (
                    execution_id, trade_id, account_id, instrument_id, ticker,
                    side, amount, price, quote_amount, commission, closed_pnl,
                    transact_time, trade_date, source, raw_json
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    t.execution_id, t.trade_id, t.account_id, t.instrument_id, t.ticker,
                    t.side, t.amount, t.price, t.quote_amount, t.commission, t.closed_pnl,
                    t.transact_time, t.trade_date, t.source, raw_json,
                ),
            )
            if cur.rowcount:
                inserted += 1
            else:
                skipped += 1
    return inserted, skipped


def dto_to_dict(t: TradeDTO) -> dict:
    return asdict(t)
