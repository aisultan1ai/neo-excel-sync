from __future__ import annotations

from psycopg2.extras import RealDictCursor

from app.db.connection import get_db_connection


def get_user_stats(user_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) FROM tasks WHERE from_user_id = %s",
                (user_id,),
            )
            created = int(cursor.fetchone()[0])

            cursor.execute(
                "SELECT COUNT(*) FROM tasks WHERE from_user_id = %s AND status = 'Done'",
                (user_id,),
            )
            completed = int(cursor.fetchone()[0])

        return {"created": created, "completed": completed}
    finally:
        conn.close()


def get_dashboard_stats():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM users")
            total_users = int(cursor.fetchone()[0])

            cursor.execute("SELECT COUNT(*) FROM tasks")
            total_tasks = int(cursor.fetchone()[0])

            cursor.execute("SELECT COUNT(*) FROM tasks WHERE status != 'Done'")
            active_tasks = int(cursor.fetchone()[0])

        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT t.title, t.status, t.created_at, u.username
                FROM tasks t
                JOIN users u ON t.from_user_id = u.id
                ORDER BY t.created_at DESC
                LIMIT 5
                """
            )
            recent = cursor.fetchall()

        return {
            "users": total_users,
            "total_tasks": total_tasks,
            "active_tasks": active_tasks,
            "recent_tasks": [dict(r) for r in recent],
        }
    finally:
        conn.close()