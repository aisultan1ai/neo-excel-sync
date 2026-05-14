import logging
from typing import NamedTuple, Optional

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


class UserRow(NamedTuple):
    id: int
    username: str
    password_hash: str
    department: str
    is_admin: bool


def get_user_by_username(username: str) -> Optional[UserRow]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, password_hash, department, is_admin FROM users WHERE username = %s",
                (username,),
            )
            row = cur.fetchone()
            return UserRow(*row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, username, department, is_admin FROM users WHERE id=%s",
                (user_id,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def get_users_basic():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, username, department FROM users ORDER BY department, username")
            return cur.fetchall()
    finally:
        conn.close()


def get_all_users():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, username, department, is_admin FROM users ORDER BY id")
            return cur.fetchall()
    finally:
        conn.close()


def create_new_user(username: str, password_hash: str, department: str, is_admin: bool = False):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (username, password_hash, department, is_admin) VALUES (%s, %s, %s, %s)",
                (username, password_hash, department, is_admin),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("create_new_user error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def update_user_password(user_id: int, new_password_hash: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_password_hash, user_id))
        conn.commit()
        return True
    except Exception as e:
        log.error("update_user_password error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def delete_user(user_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM comments WHERE user_id = %s", (user_id,))
            cur.execute("DELETE FROM tasks WHERE from_user_id = %s", (user_id,))
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_user error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def count_users():
    conn = get_db_connection()
    if not conn:
        return 0
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            return int(cur.fetchone()[0])
    finally:
        conn.close()


def get_user_stats(user_id: int):
    conn = get_db_connection()
    if not conn:
        return {"created": 0, "completed": 0}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM tasks WHERE from_user_id = %s", (user_id,))
            created = int(cur.fetchone()[0])
            cur.execute(
                "SELECT COUNT(*) FROM tasks WHERE from_user_id = %s AND status = 'Done'",
                (user_id,),
            )
            completed = int(cur.fetchone()[0])
        return {"created": created, "completed": completed}
    finally:
        conn.close()


def get_dashboard_stats():
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            total_users = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM tasks")
            total_tasks = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM tasks WHERE status != 'Done'")
            active_tasks = int(cur.fetchone()[0])

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT t.title, t.status, t.created_at, u.username
                FROM tasks t JOIN users u ON t.from_user_id = u.id
                ORDER BY t.created_at DESC LIMIT 5
                """
            )
            recent = cur.fetchall()

        return {
            "users": total_users,
            "total_tasks": total_tasks,
            "active_tasks": active_tasks,
            "recent_tasks": [dict(r) for r in recent],
        }
    finally:
        conn.close()
