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