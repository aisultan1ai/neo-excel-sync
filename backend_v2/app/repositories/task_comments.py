from psycopg2.extras import RealDictCursor

from app.db.connection import get_db_connection


def list_comments(task_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    c.*,
                    u.username,
                    u.department
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.task_id = %s
                ORDER BY c.created_at ASC, c.id ASC
                """,
                (task_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def create_comment(task_id: int, user_id: int, content: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO comments (task_id, user_id, content)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (task_id, user_id, content),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()