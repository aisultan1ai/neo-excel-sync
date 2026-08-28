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


def add_department(name: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO departments (name)
                VALUES (%s)
                RETURNING id, name
                """,
                (name,),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_department(dept_id: int) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM departments WHERE id = %s", (dept_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def rename_department(dept_id: int, new_name: str) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM departments WHERE id = %s", (dept_id,))
            res = cur.fetchone()
            if not res:
                conn.rollback()
                return False

            old_name = res[0]

            cur.execute(
                "UPDATE departments SET name = %s WHERE id = %s",
                (new_name, dept_id),
            )
            cur.execute(
                "UPDATE users SET department = %s WHERE department = %s",
                (new_name, old_name),
            )
            cur.execute(
                "UPDATE tasks SET to_department = %s WHERE to_department = %s",
                (new_name, old_name),
            )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()