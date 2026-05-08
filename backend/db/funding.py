import logging
from typing import Optional

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def get_ff_accounts(user_id: int = None, is_admin: bool = True) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, name, owner_id, created_at FROM ff_sub_accounts ORDER BY id")
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_ff_account_by_id(account_id: int) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM ff_sub_accounts WHERE id = %s", (account_id,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def create_ff_account(user_id: int, name: str, api_key_enc: str, api_secret_enc: str) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO ff_sub_accounts (name, api_key_enc, api_secret_enc, owner_id)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, owner_id, created_at
                """,
                (name, api_key_enc, api_secret_enc, user_id),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception as e:
        log.error("create_ff_account error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_ff_account(account_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ff_sub_accounts WHERE id = %s", (account_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_ff_account error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def save_ff_records(account_id: int, records: list) -> int:
    conn = get_db_connection()
    if not conn:
        return 0
    try:
        new_count = 0
        with conn.cursor() as cur:
            for r in records:
                cur.execute("SELECT 1 FROM ff_funding_records WHERE tran_id = %s", (r["tran_id"],))
                if cur.fetchone():
                    continue
                cur.execute(
                    """
                    INSERT INTO ff_funding_records
                    (account_id, symbol, asset, income, income_type, tran_id, time_ms, datetime_utc, date_local)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        account_id, r["symbol"], r["asset"], r["income"], r["income_type"],
                        r["tran_id"], r["time_ms"], r["datetime_utc"], r["date_local"],
                    ),
                )
                new_count += 1
        conn.commit()
        return new_count
    except Exception as e:
        log.error("save_ff_records error: %s", e, exc_info=True)
        conn.rollback()
        return 0
    finally:
        conn.close()


def get_ff_records(
    allowed_account_ids: list,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbol: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        where = ["account_id = ANY(%s)"]
        params: list = [allowed_account_ids]
        if start_date:
            where.append("date_local >= %s"); params.append(start_date)
        if end_date:
            where.append("date_local <= %s"); params.append(end_date)
        if symbol:
            where.append("symbol = %s"); params.append(symbol)
        params += [limit, offset]

        sql = (
            "SELECT id, account_id, symbol, asset, income, datetime_utc, date_local"
            " FROM ff_funding_records WHERE " + " AND ".join(where) +
            " ORDER BY datetime_utc DESC LIMIT %s OFFSET %s"
        )
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_ff_summary(
    account_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbol: Optional[str] = None,
) -> dict:
    conn = get_db_connection()
    if not conn:
        return {"grand_total": 0.0, "total_records": 0, "by_symbol": []}
    try:
        where = ["account_id = %s"]
        params: list = [account_id]
        if start_date:
            where.append("date_local >= %s"); params.append(start_date)
        if end_date:
            where.append("date_local <= %s"); params.append(end_date)
        if symbol:
            where.append("symbol = %s"); params.append(symbol)

        w = " AND ".join(where)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"SELECT COALESCE(SUM(income), 0.0) AS grand_total, COUNT(*) AS total_records FROM ff_funding_records WHERE {w}",
                params,
            )
            agg = cur.fetchone()
            cur.execute(
                f"SELECT symbol, asset, SUM(income) AS total, COUNT(*) AS count FROM ff_funding_records WHERE {w} GROUP BY symbol, asset ORDER BY symbol, asset",
                params,
            )
            rows = cur.fetchall()

        return {
            "grand_total": float(agg["grand_total"]),
            "total_records": int(agg["total_records"]),
            "by_symbol": [
                {"symbol": r["symbol"], "asset": r["asset"], "total": float(r["total"]), "count": int(r["count"])}
                for r in rows
            ],
        }
    finally:
        conn.close()


def get_ff_accounts_with_stats(user_id: int = None, is_admin: bool = True) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, name, owner_id, created_at FROM ff_sub_accounts ORDER BY id")
            accounts = [dict(r) for r in cur.fetchall()]
            if not accounts:
                return []

            ids = [a["id"] for a in accounts]
            cur.execute(
                """
                SELECT account_id,
                       COUNT(*) AS total_records,
                       COALESCE(SUM(income), 0.0) AS total_income,
                       MAX(date_local) AS last_record_date,
                       MIN(date_local) AS first_record_date
                FROM ff_funding_records WHERE account_id = ANY(%s) GROUP BY account_id
                """,
                (ids,),
            )
            stats_map = {r["account_id"]: dict(r) for r in cur.fetchall()}

        for acc in accounts:
            s = stats_map.get(acc["id"], {})
            acc["total_records"] = int(s.get("total_records", 0))
            acc["total_income"] = float(s.get("total_income", 0.0))
            acc["last_record_date"] = str(s["last_record_date"]) if s.get("last_record_date") else None
            acc["first_record_date"] = str(s["first_record_date"]) if s.get("first_record_date") else None

        return accounts
    finally:
        conn.close()


def delete_ff_records(
    account_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbol: Optional[str] = None,
) -> int:
    conn = get_db_connection()
    if not conn:
        return 0
    try:
        where = ["account_id = %s"]
        params: list = [account_id]
        if start_date:
            where.append("date_local >= %s"); params.append(start_date)
        if end_date:
            where.append("date_local <= %s"); params.append(end_date)
        if symbol:
            where.append("symbol = %s"); params.append(symbol)

        with conn.cursor() as cur:
            cur.execute("DELETE FROM ff_funding_records WHERE " + " AND ".join(where), params)
            count = cur.rowcount
        conn.commit()
        return count
    except Exception as e:
        log.error("delete_ff_records error: %s", e, exc_info=True)
        conn.rollback()
        return 0
    finally:
        conn.close()
