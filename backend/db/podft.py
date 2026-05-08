import hashlib
import json
import logging
from datetime import date as _date
from typing import Any, Dict, List

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection, to_jsonb

log = logging.getLogger(__name__)


def _podft_row_hash(trade: Dict[str, Any]) -> str:
    payload = {
        "account": trade.get("account"),
        "instrument": trade.get("instrument"),
        "side": trade.get("side"),
        "trading_dt": trade.get("trading_dt"),
        "deal_dt": trade.get("deal_dt"),
        "value_date": str(trade.get("value_date")),
        "qty": str(trade.get("qty")),
        "amount_tg": str(trade.get("amount_tg")),
    }
    s = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def create_podft_snapshot(snapshot_date: _date, created_by: str):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO podft_snapshots(snapshot_date, created_by) VALUES (%s, %s) RETURNING *",
                (snapshot_date, created_by),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_podft_snapshot error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def add_podft_snapshot_trades(snapshot_id: int, trades: List[Dict[str, Any]]) -> int:
    conn = get_db_connection()
    if not conn:
        return 0
    try:
        inserted = 0
        with conn.cursor() as cur:
            for t in trades:
                if t.get("value_date") is None:
                    continue
                row_hash = _podft_row_hash(t)
                cur.execute(
                    """
                    INSERT INTO podft_snapshot_trades
                    (snapshot_id, row_hash, account, instrument, side, trading_dt, deal_dt, value_date, qty, amount_tg, raw)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (snapshot_id, row_hash) DO NOTHING
                    """,
                    (
                        snapshot_id, row_hash,
                        t.get("account"), t.get("instrument"), t.get("side"),
                        t.get("trading_dt"), t.get("deal_dt"), t.get("value_date"),
                        t.get("qty"), t.get("amount_tg"),
                        to_jsonb(t.get("raw") or t),
                    ),
                )
                if cur.rowcount > 0:
                    inserted += 1
        conn.commit()
        return inserted
    except Exception as e:
        log.error("add_podft_snapshot_trades error: %s", e, exc_info=True)
        conn.rollback()
        return 0
    finally:
        conn.close()


def get_latest_podft_snapshot_for_date(snapshot_date: _date):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM podft_snapshots WHERE snapshot_date = %s ORDER BY created_at DESC LIMIT 1",
                (snapshot_date,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def get_podft_snapshot_count(snapshot_id: int) -> int:
    conn = get_db_connection()
    if not conn:
        return 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM podft_snapshot_trades WHERE snapshot_id = %s", (snapshot_id,)
            )
            return int(cur.fetchone()[0])
    finally:
        conn.close()


def get_podft_trades_by_snapshot(snapshot_id: int, limit: int = 500):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT account, instrument, side, trading_dt, deal_dt, value_date, qty, amount_tg, raw
                FROM podft_snapshot_trades
                WHERE snapshot_id = %s ORDER BY created_at DESC, id DESC LIMIT %s
                """,
                (snapshot_id, limit),
            )
            return cur.fetchall()
    finally:
        conn.close()
