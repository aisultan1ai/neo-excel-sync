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