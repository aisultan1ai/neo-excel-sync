import logging
from typing import Optional

from psycopg2.extras import Json, RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def get_crypto_accounts():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM crypto_accounts ORDER BY created_at DESC, id DESC")
            return cur.fetchall()
    finally:
        conn.close()


def create_crypto_account(provider: str, name: str, asset: str = None):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO crypto_accounts(provider, name, asset) VALUES (%s, %s, %s) RETURNING *",
                (provider, name, asset),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_crypto_account error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def update_crypto_account(account_id: int, provider: str, name: str, asset: str = None):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "UPDATE crypto_accounts SET provider=%s, name=%s, asset=%s WHERE id=%s RETURNING *",
                (provider, name, asset, account_id),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("update_crypto_account error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_crypto_account(account_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM crypto_accounts WHERE id=%s", (account_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_crypto_account error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def crypto_account_exists(account_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM crypto_accounts WHERE id=%s", (account_id,))
            return cur.fetchone() is not None
    finally:
        conn.close()


def get_crypto_transfers():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM crypto_transfers ORDER BY date DESC, id DESC")
            return cur.fetchall()
    finally:
        conn.close()


def create_crypto_transfer(
    date, type_: str, from_id, to_id, amount, asset: str, comment: str = "", label: str = ""
):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO crypto_transfers(date, type, from_account_id, to_account_id, amount, asset, comment, label)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *
                """,
                (date, type_, from_id, to_id, amount, asset, comment or None, label or None),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_crypto_transfer error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_crypto_transfer(transfer_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM crypto_transfers WHERE id=%s", (transfer_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception as e:
        log.error("delete_crypto_transfer error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def get_crypto_schemes():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM crypto_schemes ORDER BY created_at DESC, id DESC")
            return cur.fetchall()
    finally:
        conn.close()


def create_crypto_scheme(name: str, nodes, edges):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO crypto_schemes(name, nodes, edges) VALUES (%s, %s, %s) RETURNING *",
                (name, Json(nodes), Json(edges)),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_crypto_scheme error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_crypto_scheme(scheme_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM crypto_schemes WHERE id=%s", (scheme_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_crypto_scheme error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()
