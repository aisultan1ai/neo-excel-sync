import logging
import os
from pathlib import Path
from typing import Optional

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection

log = logging.getLogger(__name__)

_BASE_REPORTS_DIR = Path(__file__).resolve().parent.parent / "client_reports"


def search_clients(search_term: str = ""):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if search_term:
                term = f"%{search_term}%"
                cur.execute(
                    "SELECT id, name, status FROM clients WHERE name ILIKE %s OR account_number ILIKE %s ORDER BY name",
                    (term, term),
                )
            else:
                cur.execute("SELECT id, name, status FROM clients ORDER BY name")
            rows = cur.fetchall()
            return [(r["id"], r["name"], r["status"]) for r in rows]
    finally:
        conn.close()


def get_client_details(client_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM clients WHERE id = %s", (client_id,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def add_client(name: str, email: str, account: str, folder_path_override: Optional[str] = None):
    if not name:
        return False, "Имя клиента обязательно."

    if folder_path_override:
        try:
            resolved = Path(folder_path_override).resolve()
            allowed = _BASE_REPORTS_DIR.resolve()
            resolved.relative_to(allowed)
        except ValueError:
            return False, "Недопустимый путь для папки клиента"
        except Exception:
            return False, "Недопустимый путь для папки клиента"
        final_folder_path = str(resolved)
    else:
        _BASE_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = "".join([c for c in name if c.isalnum() or c == " "]).rstrip()
        final_folder_path = str(_BASE_REPORTS_DIR / safe_name)

    if not os.path.exists(final_folder_path):
        try:
            os.makedirs(final_folder_path)
        except OSError as e:
            return False, f"Ошибка создания папки: {e}"

    conn = get_db_connection()
    if not conn:
        return False, "Ошибка БД"
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO clients (name, email, account_number, folder_path, status) VALUES (%s, %s, %s, %s, 'gray')",
                (name, email, account, final_folder_path),
            )
        conn.commit()
        return True, "Клиент успешно добавлен."
    except Exception as e:
        conn.rollback()
        return False, f"Ошибка БД: {e}"
    finally:
        conn.close()


def update_client(client_id: int, name: str, email: str, account: str, folder_path: str):
    conn = get_db_connection()
    if not conn:
        return False, "Ошибка БД"
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE clients SET name=%s, email=%s, account_number=%s, folder_path=%s WHERE id=%s",
                (name, email, account, folder_path, client_id),
            )
        conn.commit()
        return True, "Данные обновлены."
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()


def update_client_status(client_id: int, new_status: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE clients SET status = %s WHERE id = %s", (new_status, client_id))
        conn.commit()
        return True
    except Exception as e:
        log.error("update_client_status error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def delete_client(client_id: int):
    conn = get_db_connection()
    if not conn:
        return False, "Ошибка БД"
    try:
        folder_path = None
        with conn.cursor() as cur:
            cur.execute("SELECT folder_path FROM clients WHERE id = %s", (client_id,))
            row = cur.fetchone()
            if row:
                folder_path = row[0]
            cur.execute("DELETE FROM clients WHERE id = %s", (client_id,))
        conn.commit()
        if folder_path:
            folder = Path(folder_path)
            if folder.exists() and folder.is_dir():
                try:
                    import shutil
                    shutil.rmtree(folder)
                except Exception as e:
                    log.warning("Could not delete client folder %s: %s", folder_path, e)
        return True, "Клиент удален."
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()


def reset_all_clients_statuses():
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE clients SET status = 'gray'")
        conn.commit()
        return True
    except Exception as e:
        log.error("reset_all_clients_statuses error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()
