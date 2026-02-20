# database_manager.py
from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import date as _date
from typing import Any, Dict, List, Optional
from datetime import datetime
from decimal import Decimal


import psycopg2
from psycopg2.extras import (
    Json,
    RealDictCursor,
    register_default_json,
    register_default_jsonb,
)

# Ensure JSON/JSONB from Postgres is parsed into Python objects
register_default_json(loads=json.loads, globally=True)
register_default_jsonb(loads=json.loads, globally=True)

log = logging.getLogger(__name__)


def _json_default(o):
    # dates / datetimes
    if isinstance(o, (_date, datetime)):
        return o.isoformat()

    # decimals
    if isinstance(o, Decimal):
        return float(o)

    # sets
    if isinstance(o, set):
        return list(o)

    # fallback (covers numpy types etc.)
    return str(o)


def _json_dumps(obj):
    return json.dumps(obj, ensure_ascii=False, default=_json_default)


def _to_jsonb(obj):
    return Json(obj, dumps=_json_dumps)


def _build_db_config() -> Optional[dict]:
    dbname = os.getenv("POSTGRES_DB")
    user = os.getenv("POSTGRES_USER")
    password = os.getenv("POSTGRES_PASSWORD")

    if not dbname or not user or not password:
        log.error(
            "DB env vars missing. Need POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD."
        )
        return None

    return {
        "dbname": dbname,
        "user": user,
        "password": password,
        "host": os.getenv("DB_HOST", "db"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "5")),
        "application_name": os.getenv("DB_APP_NAME", "neoexcelsync"),
    }


def get_db_connection():
    """
    Returns psycopg2 connection or None.
    """
    cfg = _build_db_config()
    if not cfg:
        return None

    try:
        conn = psycopg2.connect(**cfg)
        conn.set_client_encoding("UTF8")
        return conn
    except Exception as e:
        log.error("Ошибка подключения к БД: %s", e, exc_info=True)
        return None


def _safe_ddl(cur, sql: str) -> None:
    try:
        cur.execute(sql)
    except Exception as e:
        # In autocommit mode this won't rollback previous DDL
        first_line = (sql.splitlines() or [""])[0]
        log.warning("DDL skipped/failed: %s | err=%s", first_line[:120], e)


def init_database():
    """
    Создает таблицы и обновляет схему БД.
    ВАЖНО: используем autocommit, чтобы частичные rollback не откатывали уже созданные таблицы.
    """
    conn = get_db_connection()
    if not conn:
        return

    try:
        conn.autocommit = True
        with conn.cursor() as cursor:
            # 1) CLIENTS
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS clients (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT,
                    account_number TEXT,
                    status TEXT DEFAULT 'gray',
                    folder_path TEXT
                )
                """
            )

            # 2) USERS
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    department VARCHAR(50) DEFAULT 'Back Office',
                    is_admin BOOLEAN DEFAULT FALSE
                )
                """
            )

            # extra upgrades (safe)
            _safe_ddl(
                cursor,
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(50) DEFAULT 'Back Office'",
            )
            _safe_ddl(
                cursor,
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE",
            )

            # 2.1) DEPARTMENTS
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS departments (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL
                )
                """
            )

            cursor.execute("SELECT COUNT(*) FROM departments")
            if (cursor.fetchone() or [0])[0] == 0:
                default_depts = [
                    ("Back Office",),
                    ("Trading",),
                    ("Бухгалтерия",),
                    ("Sales",),
                ]
                cursor.executemany(
                    "INSERT INTO departments (name) VALUES (%s)",
                    default_depts,
                )

            # 3) TASKS (create with full schema)
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS tasks (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,

                    from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

                    to_department TEXT NOT NULL,

                    to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    accepted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    accepted_at TIMESTAMP,
                    due_date DATE,
                    priority TEXT DEFAULT 'normal',

                    status TEXT DEFAULT 'Open',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            # upgrades for older DBs
            _safe_ddl(
                cursor, "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS to_user_id INTEGER"
            )
            _safe_ddl(
                cursor,
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_by_user_id INTEGER",
            )
            _safe_ddl(
                cursor,
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP",
            )
            _safe_ddl(
                cursor, "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE"
            )
            _safe_ddl(
                cursor,
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'",
            )

            # add FK constraints if missing (older DBs)
            _safe_ddl(
                cursor,
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_to_user_fk') THEN
                    ALTER TABLE tasks
                      ADD CONSTRAINT tasks_to_user_fk
                      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL;
                  END IF;

                  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_accepted_by_fk') THEN
                    ALTER TABLE tasks
                      ADD CONSTRAINT tasks_accepted_by_fk
                      FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
                  END IF;
                END$$;
                """,
            )

            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_tasks_to_dept ON tasks(to_department)",
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_tasks_accepted_by ON tasks(accepted_by_user_id)",
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_tasks_to_user ON tasks(to_user_id)",
            )
            _safe_ddl(
                cursor, "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)"
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)",
            )

            # 4) COMMENTS
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS comments (
                    id SERIAL PRIMARY KEY,
                    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id)",
            )

            # 5) TASK_ATTACHMENTS
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS task_attachments (
                    id SERIAL PRIMARY KEY,
                    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                    filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id)",
            )

            # PROBLEMS
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS problems (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_problems_created_at ON problems(created_at DESC)",
            )

            # CRYPTO
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS crypto_accounts (
                    id SERIAL PRIMARY KEY,
                    provider TEXT NOT NULL,
                    name TEXT NOT NULL,
                    asset TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_crypto_accounts_created_at ON crypto_accounts(created_at DESC)",
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS crypto_transfers (
                    id SERIAL PRIMARY KEY,
                    date DATE NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('transfer','deposit','withdraw')),
                    from_account_id INTEGER REFERENCES crypto_accounts(id) ON DELETE SET NULL,
                    to_account_id   INTEGER REFERENCES crypto_accounts(id) ON DELETE SET NULL,
                    amount NUMERIC NOT NULL,
                    asset TEXT NOT NULL,
                    comment TEXT,
                    label TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_crypto_transfers_date ON crypto_transfers(date DESC)",
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS crypto_schemes (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    nodes JSONB NOT NULL,
                    edges JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_crypto_schemes_created_at ON crypto_schemes(created_at DESC)",
            )

            # PODFT SNAPSHOTS
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS podft_snapshots (
                    id SERIAL PRIMARY KEY,
                    snapshot_date DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT
                )
                """
            )

            # PODFT SNAPSHOT TRADES  ✅ FIXED
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS podft_snapshot_trades
                (
                    id
                    SERIAL
                    PRIMARY
                    KEY,
                    snapshot_id
                    INTEGER
                    NOT
                    NULL
                    REFERENCES
                    podft_snapshots
                (
                    id
                ) ON DELETE CASCADE,
                    row_hash TEXT NOT NULL,

                    account TEXT,
                    instrument TEXT,
                    side TEXT,
                    trading_dt TEXT,
                    deal_dt TEXT,
                    value_date DATE NOT NULL,
                    qty NUMERIC,
                    amount_tg NUMERIC,

                    raw JSONB, -- вся исходная строка (сериализованная)

                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE
                (
                    snapshot_id,
                    row_hash
                )
                    )
                """
            )

            # upgrades for older DBs
            _safe_ddl(
                cursor,
                "ALTER TABLE podft_snapshot_trades ADD COLUMN IF NOT EXISTS raw JSONB",
            )

            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshots_date ON podft_snapshots(snapshot_date)",
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_snapshot ON podft_snapshot_trades(snapshot_id)",
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_value_date ON podft_snapshot_trades(value_date)",
            )
            _safe_ddl(
                cursor,
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_created_at ON podft_snapshot_trades(created_at DESC)",
            )

        log.info("БД инициализирована успешно.")

    except Exception as e:
        log.error("Ошибка инициализации БД: %s", e, exc_info=True)
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


# -------------------------
# CLIENTS
# -------------------------
def search_clients(search_term: str = ""):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            if search_term:
                term = f"%{search_term}%"
                cursor.execute(
                    """
                    SELECT id, name, status
                    FROM clients
                    WHERE name ILIKE %s OR account_number ILIKE %s
                    ORDER BY name
                    """,
                    (term, term),
                )
            else:
                cursor.execute("SELECT id, name, status FROM clients ORDER BY name")

            rows = cursor.fetchall()
            return [(r["id"], r["name"], r["status"]) for r in rows]
    finally:
        conn.close()


def get_client_details(client_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM clients WHERE id = %s", (client_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def add_client(
    name: str, email: str, account: str, folder_path_override: Optional[str] = None
):
    if not name:
        return False, "Имя клиента обязательно."

    final_folder_path = folder_path_override
    if not final_folder_path:
        base_dir = os.path.join(os.getcwd(), "client_reports")
        os.makedirs(base_dir, exist_ok=True)
        safe_name = "".join([c for c in name if c.isalnum() or c == " "]).rstrip()
        final_folder_path = os.path.join(base_dir, safe_name)

    if not os.path.exists(final_folder_path):
        try:
            os.makedirs(final_folder_path)
        except OSError as e:
            return False, f"Ошибка создания папки: {e}"

    conn = get_db_connection()
    if not conn:
        return False, "Ошибка БД"
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO clients (name, email, account_number, folder_path, status)
                VALUES (%s, %s, %s, %s, 'gray')
                """,
                (name, email, account, final_folder_path),
            )
        conn.commit()
        return True, "Клиент успешно добавлен."
    except Exception as e:
        conn.rollback()
        return False, f"Ошибка БД: {e}"
    finally:
        conn.close()


def update_client(
    client_id: int, name: str, email: str, account: str, folder_path: str
):
    conn = get_db_connection()
    if not conn:
        return False, "Ошибка БД"
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE clients
                SET name=%s, email=%s, account_number=%s, folder_path=%s
                WHERE id=%s
                """,
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
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE clients SET status = %s WHERE id = %s",
                (new_status, client_id),
            )
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
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM clients WHERE id = %s", (client_id,))
        conn.commit()
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
        with conn.cursor() as cursor:
            cursor.execute("UPDATE clients SET status = 'gray'")
        conn.commit()
        return True
    except Exception as e:
        log.error("Error resetting statuses: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


# -------------------------
# USERS
# -------------------------
def get_user_by_username(username: str):
    """
    Returns tuple (id, username, password_hash, department, is_admin) or None.
    """
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, username, password_hash, department, is_admin
                FROM users
                WHERE username = %s
                """,
                (username,),
            )
            return cursor.fetchone()
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
            cur.execute(
                "SELECT id, username, department FROM users ORDER BY department, username"
            )
            return cur.fetchall()
    finally:
        conn.close()


def get_all_users():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, username, department, is_admin FROM users ORDER BY id"
            )
            return cursor.fetchall()
    finally:
        conn.close()


def create_new_user(
    username: str, password_hash: str, department: str, is_admin: bool = False
):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (username, password_hash, department, is_admin)
                VALUES (%s, %s, %s, %s)
                """,
                (username, password_hash, department, is_admin),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("Error creating user: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def update_user_password(user_id: int, new_password_hash: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (new_password_hash, user_id),
            )
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
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM comments WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM tasks WHERE from_user_id = %s", (user_id,))
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
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


# -------------------------
# DEPARTMENTS
# -------------------------
def get_all_departments():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM departments ORDER BY id")
            return cursor.fetchall()
    finally:
        conn.close()


def add_department(name: str):
    conn = get_db_connection()
    if not conn:
        return False, "Ошибка БД"
    try:
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO departments (name) VALUES (%s)", (name,))
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
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM departments WHERE id = %s", (dept_id,))
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
        with conn.cursor() as cursor:
            cursor.execute("SELECT name FROM departments WHERE id = %s", (dept_id,))
            res = cursor.fetchone()
            if not res:
                return False
            old_name = res[0]

            cursor.execute(
                "UPDATE departments SET name = %s WHERE id = %s", (new_name, dept_id)
            )
            cursor.execute(
                "UPDATE users SET department = %s WHERE department = %s",
                (new_name, old_name),
            )
            cursor.execute(
                "UPDATE tasks SET to_department = %s WHERE to_department = %s",
                (new_name, old_name),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("rename_department error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


# -------------------------
# TASKS
# -------------------------
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
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO tasks (title, description, from_user_id, to_department, to_user_id, due_date, priority)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    title,
                    description,
                    from_user_id,
                    to_department,
                    to_user_id,
                    due_date,
                    priority,
                ),
            )
            task_id = cursor.fetchone()[0]
        conn.commit()
        return task_id
    except Exception as e:
        log.error("Create task error: %s", e, exc_info=True)
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


def get_tasks_by_dept(department: str):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT t.*,
                       au.username as author_name, au.department as author_dept,
                       acc.username as accepted_by_name, acc.department as accepted_by_dept,
                       tu.username as to_user_name, tu.department as to_user_dept
                FROM tasks t
                LEFT JOIN users au  ON t.from_user_id = au.id
                LEFT JOIN users acc ON t.accepted_by_user_id = acc.id
                LEFT JOIN users tu  ON t.to_user_id = tu.id
                WHERE t.to_department = %s
                ORDER BY t.created_at DESC
                """,
                (department,),
            )
            return cursor.fetchall()
    finally:
        conn.close()


def get_user_tasks(user_id: int):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT t.*,
                       au.username as author_name, au.department as author_dept,
                       acc.username as accepted_by_name, acc.department as accepted_by_dept,
                       tu.username as to_user_name, tu.department as to_user_dept
                FROM tasks t
                LEFT JOIN users au  ON t.from_user_id = au.id
                LEFT JOIN users acc ON t.accepted_by_user_id = acc.id
                LEFT JOIN users tu  ON t.to_user_id = tu.id
                WHERE t.from_user_id = %s
                ORDER BY t.created_at DESC
                """,
                (user_id,),
            )
            return cursor.fetchall()
    finally:
        conn.close()


def get_task_by_id(task_id: int):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT t.*,
                       au.username as author_name, au.department as author_dept,
                       acc.username as accepted_by_name, acc.department as accepted_by_dept,
                       tu.username as to_user_name, tu.department as to_user_dept
                FROM tasks t
                LEFT JOIN users au  ON t.from_user_id = au.id
                LEFT JOIN users acc ON t.accepted_by_user_id = acc.id
                LEFT JOIN users tu  ON t.to_user_id = tu.id
                WHERE t.id = %s
                """,
                (task_id,),
            )
            return cursor.fetchone()
    finally:
        conn.close()


def update_task(task_id: int, title: str, description: str):
    return update_task_content(task_id, title, description)


def update_task_content(task_id: int, title: str, description: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE tasks SET title = %s, description = %s WHERE id = %s",
                (title, description, task_id),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("Error updating task: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def update_task_status(task_id: int, new_status: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE tasks SET status = %s WHERE id = %s", (new_status, task_id)
            )
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
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM comments WHERE task_id = %s", (task_id,))
            cursor.execute(
                "DELETE FROM task_attachments WHERE task_id = %s", (task_id,)
            )
            cursor.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("Error deleting task: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


# -------------------------
# COMMENTS
# -------------------------
def add_comment(task_id: int, user_id: int, content: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
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
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT c.*, u.username, u.department
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.task_id = %s
                ORDER BY c.created_at ASC
                """,
                (task_id,),
            )
            return cursor.fetchall()
    finally:
        conn.close()

# -------------------------
# ATTACHMENTS
# -------------------------
def add_task_attachment(task_id: int, filename: str, file_path: str):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO task_attachments (task_id, filename, file_path)
                VALUES (%s, %s, %s)
                """,
                (task_id, filename, file_path),
            )
        conn.commit()
        return True
    except Exception as e:
        log.error("Ошибка сохранения вложения: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def get_task_attachments(task_id: int):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM task_attachments WHERE task_id = %s ORDER BY uploaded_at DESC",
                (task_id,),
            )
            return cursor.fetchall()
    finally:
        conn.close()


def delete_task_attachment(attachment_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM task_attachments WHERE id = %s", (attachment_id,)
            )
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
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM task_attachments WHERE id = %s", (attachment_id,)
            )
            return cursor.fetchone()
    finally:
        conn.close()



# -------------------------
# DASHBOARD / STATS
# -------------------------
def get_user_stats(user_id: int):
    conn = get_db_connection()
    if not conn:
        return {"created": 0, "completed": 0}
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) FROM tasks WHERE from_user_id = %s", (user_id,)
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
    if not conn:
        return None
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


# -------------------------
# PROBLEMS
# -------------------------
def get_problems(limit: int = 50):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT p.*,
                       u.username AS created_by_username
                FROM problems p
                LEFT JOIN users u ON p.created_by_user_id = u.id
                ORDER BY p.created_at DESC
                LIMIT %s
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
                SELECT p.*,
                       u.username AS created_by_username
                FROM problems p
                LEFT JOIN users u ON p.created_by_user_id = u.id
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
                """
                INSERT INTO problems(title, description, created_by_user_id)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
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
                """
                UPDATE problems
                SET title = %s,
                    description = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
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


# -------------------------
# CRYPTO: ACCOUNTS
# -------------------------
def get_crypto_accounts():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM crypto_accounts ORDER BY created_at DESC, id DESC"
            )
            return cursor.fetchall()
    finally:
        conn.close()


def create_crypto_account(provider: str, name: str, asset: str = None):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO crypto_accounts(provider, name, asset)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (provider, name, asset),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_crypto_account error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def update_crypto_account(account_id: int, provider: str, name: str, asset: str = None):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                UPDATE crypto_accounts
                SET provider=%s, name=%s, asset=%s
                WHERE id=%s
                RETURNING *
                """,
                (provider, name, asset, account_id),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("update_crypto_account error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_crypto_account(account_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM crypto_accounts WHERE id=%s", (account_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_crypto_account error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


def crypto_account_exists(account_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM crypto_accounts WHERE id=%s", (account_id,))
            return cursor.fetchone() is not None
    finally:
        conn.close()


# -------------------------
# CRYPTO: TRANSFERS
# -------------------------
def get_crypto_transfers():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM crypto_transfers ORDER BY date DESC, id DESC")
            return cursor.fetchall()
    finally:
        conn.close()


def create_crypto_transfer(
    date,
    type_: str,
    from_id,
    to_id,
    amount,
    asset: str,
    comment: str = "",
    label: str = "",
):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO crypto_transfers(date, type, from_account_id, to_account_id, amount, asset, comment, label)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    date,
                    type_,
                    from_id,
                    to_id,
                    amount,
                    asset,
                    comment or None,
                    label or None,
                ),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_crypto_transfer error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_crypto_transfer(transfer_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM crypto_transfers WHERE id=%s", (transfer_id,))
            deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    except Exception as e:
        log.error("delete_crypto_transfer error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


# -------------------------
# CRYPTO: SCHEMES (ReactFlow)
# -------------------------
def get_crypto_schemes():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM crypto_schemes ORDER BY created_at DESC, id DESC"
            )
            return cursor.fetchall()
    finally:
        conn.close()


def create_crypto_scheme(name: str, nodes, edges):
    """
    nodes/edges — питоновские dict/list (из ReactFlow)
    сохраняем через psycopg2.extras.Json
    """
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO crypto_schemes(name, nodes, edges)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (name, Json(nodes), Json(edges)),
            )
            row = cursor.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_crypto_scheme error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def delete_crypto_scheme(scheme_id: int):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM crypto_schemes WHERE id=%s", (scheme_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_crypto_scheme error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()


# -------------------------
# PODFT helpers
# -------------------------
def _podft_row_hash(trade: Dict[str, Any]) -> str:
    payload = {
        "account": trade.get("account"),
        "instrument": trade.get("instrument"),
        "side": trade.get("side"),
        "trading_dt": trade.get("trading_dt"),
        "deal_dt": trade.get("deal_dt"),
        "value_date": str(trade.get("value_date")),
        "qty": str(trade.get("qty")),
        "amount_tg": str(trade.get("amount_tg")),
    }
    s = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def create_podft_snapshot(snapshot_date: _date, created_by: str):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO podft_snapshots(snapshot_date, created_by)
                VALUES (%s, %s)
                RETURNING *
                """,
                (snapshot_date, created_by),
            )
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        log.error("create_podft_snapshot error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def add_podft_snapshot_trades(snapshot_id: int, trades: List[Dict[str, Any]]) -> int:
    conn = get_db_connection()
    if not conn:
        return 0

    try:
        inserted = 0
        with conn.cursor() as cur:
            for t in trades:
                if t.get("value_date") is None:
                    # value_date NOT NULL in schema
                    continue

                row_hash = _podft_row_hash(t)

                cur.execute(
                    """
                    INSERT INTO podft_snapshot_trades
                    (snapshot_id, row_hash, account, instrument, side, trading_dt, deal_dt, value_date, qty, amount_tg,
                     raw)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (snapshot_id, row_hash) DO NOTHING
                    """,
                    (
                        snapshot_id,
                        row_hash,
                        t.get("account"),
                        t.get("instrument"),
                        t.get("side"),
                        t.get("trading_dt"),
                        t.get("deal_dt"),
                        t.get("value_date"),
                        t.get("qty"),
                        t.get("amount_tg"),
                        _to_jsonb(
                            t.get("raw") or t
                        ),  # ✅ теперь date нормально уйдёт как ISO строка
                    ),
                )
                if cur.rowcount > 0:
                    inserted += 1

        conn.commit()
        return inserted
    except Exception as e:
        log.error("add_podft_snapshot_trades error: %s", e, exc_info=True)
        conn.rollback()
        return 0
    finally:
        conn.close()


def get_latest_podft_snapshot_for_date(snapshot_date: _date):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM podft_snapshots
                WHERE snapshot_date = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (snapshot_date,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def get_podft_snapshot_count(snapshot_id: int) -> int:
    conn = get_db_connection()
    if not conn:
        return 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM podft_snapshot_trades WHERE snapshot_id = %s",
                (snapshot_id,),
            )
            return int(cur.fetchone()[0])
    finally:
        conn.close()


def get_podft_trades_by_snapshot(snapshot_id: int, limit: int = 500):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT account, instrument, side, trading_dt, deal_dt, value_date, qty, amount_tg, raw
                FROM podft_snapshot_trades
                WHERE snapshot_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT %s
                """,
                (snapshot_id, limit),
            )
            return cur.fetchall()
    finally:
        conn.close()
