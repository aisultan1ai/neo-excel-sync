from psycopg2.extras import RealDictCursor

from app.db.connection import get_db_connection


def get_user_by_username(username: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, username, password_hash, department, is_admin
                FROM users
                WHERE username = %s
                """,
                (username,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def get_user_public_by_username(username: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, username, department, is_admin
                FROM users
                WHERE username = %s
                """,
                (username,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def get_user_by_id(user_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, username, department, is_admin
                FROM users
                WHERE id = %s
                """,
                (user_id,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def get_users_basic():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, username, department
                FROM users
                ORDER BY department, username
                """
            )
            return cur.fetchall()
    finally:
        conn.close()


def list_users():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, username, department, is_admin
                FROM users
                ORDER BY id
                """
            )
            return cur.fetchall()
    finally:
        conn.close()


def create_user(username: str, password_hash: str, department: str, is_admin: bool):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO users (username, password_hash, department, is_admin)
                VALUES (%s, %s, %s, %s)
                RETURNING id, username, department, is_admin
                """,
                (username, password_hash, department, is_admin),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_user_password(user_id: int, new_password_hash: str) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE users
                SET password_hash = %s
                WHERE id = %s
                """,
                (new_password_hash, user_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
        return updated
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_user(user_id: int) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM comments WHERE user_id = %s", (user_id,))
            cur.execute("DELETE FROM tasks WHERE from_user_id = %s", (user_id,))
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()