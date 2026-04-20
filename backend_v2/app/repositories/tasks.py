from psycopg2.extras import RealDictCursor

from app.db.connection import get_db_connection


def create_task(
    title: str,
    description: str,
    from_user_id: int,
    to_department: str,
    to_user_id: int | None = None,
    status: str = "Open",
    priority: str = "normal",
    due_date=None,
):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO tasks (
                    title,
                    description,
                    from_user_id,
                    to_department,
                    to_user_id,
                    status,
                    priority,
                    due_date
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    title,
                    description,
                    from_user_id,
                    to_department,
                    to_user_id,
                    status,
                    priority,
                    due_date,
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_task_by_id(task_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    t.*,
                    u.username AS author_name,
                    tu.username AS to_user_name
                FROM tasks t
                LEFT JOIN users u ON t.from_user_id = u.id
                LEFT JOIN users tu ON t.to_user_id = tu.id
                WHERE t.id = %s
                """,
                (task_id,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def list_tasks_by_department(department: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    t.*,
                    u.username AS author_name,
                    tu.username AS to_user_name
                FROM tasks t
                LEFT JOIN users u ON t.from_user_id = u.id
                LEFT JOIN users tu ON t.to_user_id = tu.id
                WHERE t.to_department = %s
                ORDER BY t.created_at DESC, t.id DESC
                """,
                (department,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def list_tasks_created_by_user(user_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    t.*,
                    u.username AS author_name,
                    tu.username AS to_user_name
                FROM tasks t
                LEFT JOIN users u ON t.from_user_id = u.id
                LEFT JOIN users tu ON t.to_user_id = tu.id
                WHERE t.from_user_id = %s
                ORDER BY t.created_at DESC, t.id DESC
                """,
                (user_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def update_task_status(task_id: int, status: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = %s
                WHERE id = %s
                RETURNING *
                """,
                (status, task_id),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_task_content(task_id: int, title: str, description: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE tasks
                SET title = %s,
                    description = %s
                WHERE id = %s
                RETURNING *
                """,
                (title, description, task_id),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_task(task_id: int) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM comments WHERE task_id = %s", (task_id,))
            cur.execute("DELETE FROM task_attachments WHERE task_id = %s", (task_id,))
            cur.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def accept_task(task_id: int, accepter_user_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE tasks
                SET accepted_by_user_id = %s,
                    accepted_at = NOW(),
                    status = CASE WHEN status = 'Open' THEN 'In Progress' ELSE status END
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
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()