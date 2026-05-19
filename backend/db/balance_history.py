import logging
from typing import Optional

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def list_bh_accounts() -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM bh_accounts ORDER BY id")
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def create_bh_account(name: str, account_id: str, asset_id: str) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO bh_accounts (name, account_id, asset_id) VALUES (%s, %s, %s) RETURNING *",
                (name, account_id, asset_id),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception as e:
        log.error("create_bh_account error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_bh_account(row_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM bh_accounts WHERE id = %s", (row_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_bh_account error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()
