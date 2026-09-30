import logging

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def list_accounts() -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM positions_accounts ORDER BY id")
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def add_accounts(accounts: list[tuple[str, str | None]]) -> list:
    """accounts = [(account_id, name)]; уже существующие пропускаются. Возвращает добавленные."""
    conn = get_db_connection()
    if not conn:
        return []
    try:
        added = []
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for account_id, name in accounts:
                cur.execute(
                    """INSERT INTO positions_accounts (account_id, name) VALUES (%s, %s)
                       ON CONFLICT (account_id) DO NOTHING RETURNING *""",
                    (account_id, name),
                )
                row = cur.fetchone()
                if row:
                    added.append(dict(row))
        conn.commit()
        return added
    except Exception as e:
        log.error("add_accounts error: %s", e, exc_info=True)
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_account(row_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM positions_accounts WHERE id = %s", (row_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_account error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()
