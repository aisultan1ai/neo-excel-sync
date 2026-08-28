from __future__ import annotations

import json

from psycopg2.extras import Json, RealDictCursor

from app.db.connection import get_db_connection


# -------------------------
# ACCOUNTS
# -------------------------
def get_crypto_accounts():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM crypto_accounts ORDER BY created_at DESC, id DESC"
            )
            return cursor.fetchall()
    finally:
        conn.close()


def create_crypto_account(provider: str, name: str, asset: str | None = None):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO crypto_accounts(provider, name, asset)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (provider, name, asset),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_crypto_account(account_id: int, provider: str, name: str, asset: str | None = None):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                UPDATE crypto_accounts
                SET provider=%s, name=%s, asset=%s
                WHERE id=%s
                RETURNING *
                """,
                (provider, name, asset, account_id),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_crypto_account(account_id: int) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM crypto_accounts WHERE id=%s", (account_id,))
            deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def crypto_account_exists(account_id: int) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM crypto_accounts WHERE id=%s", (account_id,))
            return cursor.fetchone() is not None
    finally:
        conn.close()


# -------------------------
# TRANSFERS
# -------------------------
def get_crypto_transfers():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM crypto_transfers ORDER BY date DESC, id DESC")
            return cursor.fetchall()
    finally:
        conn.close()


def create_crypto_transfer(
    date,
    type_: str,
    from_id,
    to_id,
    amount,
    asset: str,
    comment: str = "",
    label: str = "",
):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO crypto_transfers(date, type, from_account_id, to_account_id, amount, asset, comment, label)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    date,
                    type_,
                    from_id,
                    to_id,
                    amount,
                    asset,
                    comment or None,
                    label or None,
                ),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_crypto_transfer(transfer_id: int) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM crypto_transfers WHERE id=%s", (transfer_id,))
            deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# -------------------------
# SCHEMES
# -------------------------
def get_crypto_schemes():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM crypto_schemes ORDER BY created_at DESC, id DESC"
            )
            return cursor.fetchall()
    finally:
        conn.close()


def create_crypto_scheme(name: str, nodes, edges):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO crypto_schemes(name, nodes, edges)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (name, Json(nodes), Json(edges)),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_crypto_scheme(scheme_id: int) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM crypto_schemes WHERE id=%s", (scheme_id,))
            deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()