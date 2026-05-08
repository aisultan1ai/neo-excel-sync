import logging

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)


def get_all_departments():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM departments ORDER BY id")
            return cur.fetchall()
    finally:
        conn.close()


def add_department(name: str):
    conn = get_db_connection()
    if not conn:
        return False, "Ошибка БД"
    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO departments (name) VALUES (%s)", (name,))
        conn.commit()
        return True, "Отдел создан"
    except Exception as e:
        conn.rollback()
        return False, f"Ошибка: {e}"
    finally:
        conn.close()


def delete_department(dept_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM departments WHERE id = %s", (dept_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_department error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def rename_department(dept_id: int, new_name: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM departments WHERE id = %s", (dept_id,))
            res = cur.fetchone()
            if not res:
                return False
            old_name = res[0]
            cur.execute("UPDATE departments SET name = %s WHERE id = %s", (new_name, dept_id))
            cur.execute("UPDATE users SET department = %s WHERE department = %s", (new_name, old_name))
            cur.execute("UPDATE tasks SET to_department = %s WHERE to_department = %s", (new_name, old_name))
        conn.commit()
        return True
    except Exception as e:
        log.error("rename_department error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()
