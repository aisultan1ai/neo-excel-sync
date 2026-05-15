import json
import logging
from typing import Optional

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def get_unity_config(user_id: int) -> dict:
    conn = get_db_connection()
    if not conn:
        return {"base_url": "", "has_token": False, "auth_token_enc": ""}
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM ff_unity_config WHERE owner_id = %s LIMIT 1", (user_id,))
            row = cur.fetchone()
            if not row:
                return {"base_url": "", "has_token": False, "auth_token_enc": ""}
            return {
                "id": row["id"],
                "base_url": row["base_url"],
                "has_token": bool(row["auth_token_enc"]),
                "auth_token_enc": row["auth_token_enc"],
            }
    finally:
        conn.close()


def save_unity_config(base_url: str, auth_token_enc: str, user_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM ff_unity_config WHERE owner_id = %s LIMIT 1", (user_id,))
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE ff_unity_config SET base_url=%s, auth_token_enc=%s, updated_at=NOW() WHERE id=%s",
                    (base_url, auth_token_enc, row[0]),
                )
            else:
                cur.execute(
                    "INSERT INTO ff_unity_config (base_url, auth_token_enc, owner_id) VALUES (%s, %s, %s)",
                    (base_url, auth_token_enc, user_id),
                )
        conn.commit()
        return True
    except Exception as e:
        log.error("save_unity_config error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def log_ff_action(user_id: int, username: str, action: str, details: Optional[dict] = None) -> None:
    conn = get_db_connection()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ff_audit_log (user_id, username, action, details) VALUES (%s, %s, %s, %s)",
                (user_id, username, action, json.dumps(details) if details else None),
            )
        conn.commit()
    except Exception as e:
        log.error("log_ff_action error: %s", e)
        conn.rollback()
    finally:
        conn.close()


def get_audit_log(
    limit: int = 500,
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        where, params = [], []
        if action:
            where.append("action = %s"); params.append(action)
        if user_id:
            where.append("user_id = %s"); params.append(user_id)
        if start_date:
            where.append("created_at::date >= %s"); params.append(start_date)
        if end_date:
            where.append("created_at::date <= %s"); params.append(end_date)
        sql = "SELECT * FROM ff_audit_log"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_cashout_mapping(ff_account_id: int) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM ff_cashout_mappings WHERE ff_account_id = %s", (ff_account_id,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def get_all_cashout_mappings() -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM ff_cashout_mappings ORDER BY ff_account_id")
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def save_cashout_mapping(ff_account_id: int, unity_account_id: int, real_account_id: int, asset_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ff_cashout_mappings (ff_account_id, unity_account_id, unity_real_account_id, unity_asset_id)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (ff_account_id) DO UPDATE SET
                    unity_account_id      = EXCLUDED.unity_account_id,
                    unity_real_account_id = EXCLUDED.unity_real_account_id,
                    unity_asset_id        = EXCLUDED.unity_asset_id,
                    updated_at            = NOW()
                """,
                (ff_account_id, unity_account_id, real_account_id, asset_id),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("save_cashout_mapping error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def save_cashout_record(
    ff_account_id: int,
    amount: float,
    netting_date: str,
    start_date: Optional[str],
    end_date: Optional[str],
    transaction_id: Optional[str],
    status: str,
    comment: Optional[str],
    internal_comment: Optional[str],
    error_message: Optional[str],
    triggered_by: str,
    created_by_user_id: Optional[int],
    transaction_type: str = "cashout",
) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO ff_cashout_history
                    (ff_account_id, amount, netting_date, start_date, end_date,
                     transaction_id, status, comment, internal_comment,
                     error_message, triggered_by, created_by_user_id, transaction_type)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
                """,
                (
                    ff_account_id, amount, netting_date, start_date, end_date,
                    transaction_id, status, comment, internal_comment,
                    error_message, triggered_by, created_by_user_id, transaction_type,
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception as e:
        log.error("save_cashout_record error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def get_cashout_history(ff_account_id: Optional[int] = None, limit: int = 200) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if ff_account_id:
                cur.execute(
                    """
                    SELECT h.*, a.name AS account_name
                    FROM ff_cashout_history h LEFT JOIN ff_sub_accounts a ON a.id = h.ff_account_id
                    WHERE h.ff_account_id = %s ORDER BY h.created_at DESC LIMIT %s
                    """,
                    (ff_account_id, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT h.*, a.name AS account_name
                    FROM ff_cashout_history h LEFT JOIN ff_sub_accounts a ON a.id = h.ff_account_id
                    ORDER BY h.created_at DESC LIMIT %s
                    """,
                    (limit,),
                )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_cashout_schedules(ff_account_id: Optional[int] = None) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if ff_account_id:
                cur.execute(
                    """
                    SELECT s.*, a.name AS account_name
                    FROM ff_cashout_schedules s LEFT JOIN ff_sub_accounts a ON a.id = s.ff_account_id
                    WHERE s.ff_account_id = %s ORDER BY s.id
                    """,
                    (ff_account_id,),
                )
            else:
                cur.execute(
                    """
                    SELECT s.*, a.name AS account_name
                    FROM ff_cashout_schedules s LEFT JOIN ff_sub_accounts a ON a.id = s.ff_account_id
                    ORDER BY s.id
                    """
                )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def upsert_cashout_schedule(ff_account_id: int, frequency: str, day_of_period: int, enabled: bool) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO ff_cashout_schedules (ff_account_id, frequency, day_of_period, enabled)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (ff_account_id) DO UPDATE SET
                    frequency     = EXCLUDED.frequency,
                    day_of_period = EXCLUDED.day_of_period,
                    enabled       = EXCLUDED.enabled
                RETURNING *
                """,
                (ff_account_id, frequency, day_of_period, enabled),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception as e:
        log.error("upsert_cashout_schedule error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_cashout_schedule_by_account(ff_account_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ff_cashout_schedules WHERE ff_account_id = %s", (ff_account_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_cashout_schedule error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def mark_schedule_run(ff_account_id: int, run_date: str) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE ff_cashout_schedules SET last_run_date = %s WHERE ff_account_id = %s",
                (run_date, ff_account_id),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("mark_schedule_run error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def save_scheduled_cashout_success(
    ff_account_id: int,
    amount: float,
    netting_date: str,
    start_date: str,
    end_date: str,
    transaction_id: str,
    comment: str,
    internal_comment: str,
    run_date: str,
    owner_id: Optional[int],
    acc_name: str,
    tx_type: str,
    period: str,
    triggered_by: str = "schedule",
) -> Optional[dict]:
    """Atomically insert cashout record, mark schedule run, and log the action."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO ff_cashout_history
                    (ff_account_id, amount, netting_date, start_date, end_date,
                     transaction_id, status, comment, internal_comment,
                     error_message, triggered_by, created_by_user_id, transaction_type)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
                """,
                (
                    ff_account_id, amount, netting_date, start_date, end_date,
                    transaction_id, "success", comment, internal_comment,
                    None, triggered_by, None, tx_type,
                ),
            )
            record = cur.fetchone()
            cur.execute(
                "UPDATE ff_cashout_schedules SET last_run_date = %s WHERE ff_account_id = %s",
                (run_date, ff_account_id),
            )
            details = {
                "account_id": ff_account_id, "account_name": acc_name,
                "tx_type": tx_type, "amount": amount, "tx_id": transaction_id,
                "period": period, "triggered_by": triggered_by,
            }
            cur.execute(
                "INSERT INTO ff_audit_log (user_id, username, action, details) VALUES (%s, %s, %s, %s)",
                (owner_id, "schedule", "cashout_send", json.dumps(details)),
            )
        conn.commit()
        return dict(record) if record else None
    except Exception as e:
        log.error("save_scheduled_cashout_success error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def save_scheduled_cashout_error(
    ff_account_id: int,
    amount: float,
    netting_date: str,
    start_date: Optional[str],
    end_date: Optional[str],
    comment: str,
    error_message: str,
    triggered_by: str = "schedule",
) -> None:
    """Atomically save a failed scheduled cashout record."""
    conn = get_db_connection()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ff_cashout_history
                    (ff_account_id, amount, netting_date, start_date, end_date,
                     transaction_id, status, comment, internal_comment,
                     error_message, triggered_by, created_by_user_id, transaction_type)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    ff_account_id, amount, netting_date, start_date, end_date,
                    None, "error", comment, None,
                    error_message, triggered_by, None, "cashout",
                ),
            )
        conn.commit()
    except Exception as e:
        log.error("save_scheduled_cashout_error error: %s", e, exc_info=True)
        conn.rollback()
    finally:
        conn.close()
