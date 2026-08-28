from psycopg2.extras import RealDictCursor

from app.db.connection import get_db_connection


def create_attachment(task_id: int, filename: str, file_path: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO task_attachments (task_id, filename, file_path)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (task_id, filename, file_path),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def list_attachments(task_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM task_attachments
                WHERE task_id = %s
                ORDER BY uploaded_at DESC, id DESC
                """,
                (task_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def get_attachment_by_id(attachment_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM task_attachments
                WHERE id = %s
                """,
                (attachment_id,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def delete_attachment(attachment_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM task_attachments WHERE id = %s",
                (attachment_id,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()