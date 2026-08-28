from psycopg2.extras import RealDictCursor

from app.db.connection import get_db_connection


def search_clients(search: str = ""):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if search:
                like = f"%{search}%"
                cur.execute(
                    """
                    SELECT id, name, email, account_number, status, folder_path, created_at
                    FROM clients
                    WHERE name ILIKE %s OR account_number ILIKE %s OR email ILIKE %s
                    ORDER BY name ASC, id ASC
                    """,
                    (like, like, like),
                )
            else:
                cur.execute(
                    """
                    SELECT id, name, email, account_number, status, folder_path, created_at
                    FROM clients
                    ORDER BY name ASC, id ASC
                    """
                )
            return cur.fetchall()
    finally:
        conn.close()


def get_client_by_id(client_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name, email, account_number, status, folder_path, created_at
                FROM clients
                WHERE id = %s
                """,
                (client_id,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def create_client(name: str, email: str, account_number: str, folder_path: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO clients (name, email, account_number, folder_path, status)
                VALUES (%s, %s, %s, %s, 'gray')
                RETURNING id, name, email, account_number, status, folder_path, created_at
                """,
                (name, email, account_number, folder_path),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def create_client_with_folder(
    name: str, email: str, account_number: str, folder_path: str
):
    """
    Создаёт клиента и сразу записывает folder_path в одной транзакции.
    Используется вместо create_client + отдельного UPDATE.
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO clients (name, email, account_number, folder_path, status)
                VALUES (%s, %s, %s, %s, 'gray')
                RETURNING id, name, email, account_number, status, folder_path, created_at
                """,
                (name, email, account_number, folder_path),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_client(
    client_id: int,
    name: str,
    email: str,
    account_number: str,
    status: str,
    folder_path: str | None = None,
):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if folder_path is not None:
                cur.execute(
                    """
                    UPDATE clients
                    SET name = %s,
                        email = %s,
                        account_number = %s,
                        status = %s,
                        folder_path = %s
                    WHERE id = %s
                    RETURNING id, name, email, account_number, status, folder_path, created_at
                    """,
                    (name, email, account_number, status, folder_path, client_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE clients
                    SET name = %s,
                        email = %s,
                        account_number = %s,
                        status = %s
                    WHERE id = %s
                    RETURNING id, name, email, account_number, status, folder_path, created_at
                    """,
                    (name, email, account_number, status, client_id),
                )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_client(client_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM clients WHERE id = %s", (client_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def reset_all_clients_statuses() -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE clients SET status = 'gray'")
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()