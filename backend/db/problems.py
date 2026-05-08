import logging

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def get_problems(limit: int = 50):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT p.*, u.username AS created_by_username
                FROM problems p LEFT JOIN users u ON p.created_by_user_id = u.id
                ORDER BY p.created_at DESC LIMIT %s
                """,
                (limit,),
            )
            return cur.fetchall()
    finally:
        conn.close()


def get_problem_by_id(problem_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT p.*, u.username AS created_by_username
                FROM problems p LEFT JOIN users u ON p.created_by_user_id = u.id
                WHERE p.id = %s
                """,
                (problem_id,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def create_problem(title: str, description: str, created_by_user_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO problems(title, description, created_by_user_id) VALUES (%s, %s, %s) RETURNING *",
                (title, description or "", created_by_user_id),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_problem error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def update_problem(problem_id: int, title: str, description: str):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "UPDATE problems SET title=%s, description=%s, updated_at=NOW() WHERE id=%s RETURNING *",
                (title, description or "", problem_id),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("update_problem error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_problem(problem_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM problems WHERE id=%s", (problem_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception as e:
        log.error("delete_problem error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()
