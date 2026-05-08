import logging
from datetime import date as _date
from typing import Optional

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def create_task(
    title: str,
    description: str,
    from_user_id: int,
    to_department: str,
    to_user_id: Optional[int] = None,
    due_date: Optional[_date] = None,
    priority: str = "normal",
):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tasks (title, description, from_user_id, to_department, to_user_id, due_date, priority)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (title, description, from_user_id, to_department, to_user_id, due_date, priority),
            )
            task_id = cur.fetchone()[0]
        conn.commit()
        return task_id
    except Exception as e:
        log.error("create_task error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def accept_task(task_id: int, accepter_user_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE tasks
                SET accepted_by_user_id = %s,
                    accepted_at = NOW(),
                    status = CASE WHEN status='Open' THEN 'In Progress' ELSE status END
                WHERE id = %s
                  AND accepted_by_user_id IS NULL
                  AND to_user_id IS NULL
                  AND status <> 'Done'
                RETURNING *
                """,
                (accepter_user_id, task_id),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("accept_task error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def _task_join_query(where_clause: str):
    return f"""
        SELECT t.*,
               au.username  AS author_name,  au.department  AS author_dept,
               acc.username AS accepted_by_name, acc.department AS accepted_by_dept,
               tu.username  AS to_user_name, tu.department  AS to_user_dept
        FROM tasks t
        LEFT JOIN users au  ON t.from_user_id = au.id
        LEFT JOIN users acc ON t.accepted_by_user_id = acc.id
        LEFT JOIN users tu  ON t.to_user_id = tu.id
        {where_clause}
        ORDER BY t.created_at DESC
    """


def get_tasks_by_dept(department: str):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_task_join_query("WHERE t.to_department = %s"), (department,))
            return cur.fetchall()
    finally:
        conn.close()


def get_user_tasks(user_id: int):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_task_join_query("WHERE t.from_user_id = %s"), (user_id,))
            return cur.fetchall()
    finally:
        conn.close()


def get_task_by_id(task_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(_task_join_query("WHERE t.id = %s"), (task_id,))
            return cur.fetchone()
    finally:
        conn.close()


def update_task_content(task_id: int, title: str, description: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tasks SET title = %s, description = %s WHERE id = %s",
                (title, description, task_id),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("update_task_content error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


update_task = update_task_content


def update_task_status(task_id: int, new_status: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE tasks SET status = %s WHERE id = %s", (new_status, task_id))
        conn.commit()
        return True
    except Exception as e:
        log.error("update_task_status error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def delete_task(task_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM comments WHERE task_id = %s", (task_id,))
            cur.execute("DELETE FROM task_attachments WHERE task_id = %s", (task_id,))
            cur.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_task error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


# ── Comments ──────────────────────────────────────────────────────────────────

def add_comment(task_id: int, user_id: int, content: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO comments (task_id, user_id, content) VALUES (%s, %s, %s)",
                (task_id, user_id, content),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("add_comment error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def get_comments(task_id: int):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT c.*, u.username, u.department
                FROM comments c JOIN users u ON c.user_id = u.id
                WHERE c.task_id = %s ORDER BY c.created_at ASC
                """,
                (task_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


# ── Attachments ───────────────────────────────────────────────────────────────

def add_task_attachment(task_id: int, filename: str, file_path: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO task_attachments (task_id, filename, file_path) VALUES (%s, %s, %s)",
                (task_id, filename, file_path),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("add_task_attachment error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def get_task_attachments(task_id: int):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM task_attachments WHERE task_id = %s ORDER BY uploaded_at DESC",
                (task_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def delete_task_attachment(attachment_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM task_attachments WHERE id = %s", (attachment_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_task_attachment error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def get_attachment_by_id(attachment_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM task_attachments WHERE id = %s", (attachment_id,))
            return cur.fetchone()
    finally:
        conn.close()
