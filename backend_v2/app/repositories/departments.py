from psycopg2.extras import RealDictCursor

from app.db.connection import get_db_connection


def list_departments():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name
                FROM departments
                ORDER BY id
                """
            )
            return cur.fetchall()
    finally:
        conn.close()