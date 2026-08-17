import logging
from datetime import date, timedelta

from api import fetch_instrument_details, fetch_trades
from storage import add_instruments, get_cached_instruments, missing_instrument_ids

from .config import ALGO_ACCOUNT_ID
from .ingest import normalize_from_unity, upsert_trades
from .storage import get_conn, init_db
from .universe import invalidate_cache as invalidate_universe_cache

log = logging.getLogger(__name__)


class ServiceError(Exception):
    pass


def _resolve_account_id(explicit: str | None) -> str:
    account_id = explicit or ALGO_ACCOUNT_ID
    if not account_id:
        raise ServiceError(
            "Не задан ALGO_ACCOUNT_ID (счёт алго-фонда для сбора истории). "
            "Пропиши его в .env."
        )
    return account_id


def _last_synced_date(account_id: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT MAX(trade_date) AS d FROM trades WHERE account_id = ?",
            (account_id,),
        ).fetchone()
    return row["d"] if row and row["d"] else None


async def sync_trades(
    account_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    default_lookback_days: int = 90,
) -> dict:
    init_db()
    account_id = _resolve_account_id(account_id)

    today = date.today()
    if not to_date:
        to_date = today.isoformat()

    if not from_date:
        last = _last_synced_date(account_id)
        if last:
            start = date.fromisoformat(last) - timedelta(days=1)
        else:
            start = today - timedelta(days=default_lookback_days)
        from_date = start.isoformat()

    raw_items = await fetch_trades(from_date, to_date, account_id=account_id)

    needed_ids = [
        int(t["instrumentId"]) for t in raw_items
        if t.get("instrumentId") is not None
    ]
    to_fetch = missing_instrument_ids(needed_ids)
    if to_fetch:
        try:
            new_map = await fetch_instrument_details(to_fetch)
            if new_map:
                add_instruments(new_map)
        except Exception:  # noqa: BLE001
            log.exception("strategy_predict: не удалось дообогатить справочник инструментов")

    ticker_map = get_cached_instruments()

    dtos: list = []
    skipped_norm = 0
    for it in raw_items:
        dto = normalize_from_unity(it, ticker_map, fallback_account_id=account_id)
        if dto is None:
            skipped_norm += 1
            continue
        dtos.append(dto)

    inserted, dup = upsert_trades(dtos, raw_items=raw_items)

    if inserted:
        invalidate_universe_cache()

    return {
        "account_id": account_id,
        "from_date": from_date,
        "to_date": to_date,
        "fetched": len(raw_items),
        "normalized": len(dtos),
        "skipped_norm": skipped_norm,
        "inserted": inserted,
        "duplicates": dup,
    }
