import psycopg2
from psycopg2.extras import RealDictCursor, Json
import os
import logging

log = logging.getLogger(__name__)

# DB_CONFIG = {
#    "dbname": "neo_db",
#   "user": "postgres",
#    "password": "aisu123",
#    "host": "localhost",
#    "port": 5432
#}

DB_CONFIG = {
    "dbname": os.getenv("POSTGRES_DB", "neo_db"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "aisu123"),
    "host": os.getenv("DB_HOST", "localhost"), # <--- ГЛАВНОЕ ИЗМЕНЕНИЕ
    "port": int(os.getenv("DB_PORT", 5432)),
"client_encoding": "utf8"
}

def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.set_client_encoding('UTF8')
        return conn
    except Exception as e:
        log.error(f"Ошибка подключения к БД: {e}")
        return None


def init_database():
    """Создает таблицы и обновляет схему БД."""
    conn = get_db_connection()
    if not conn:
        return
    try:
        cursor = conn.cursor()

        # 1. Таблица CLIENTS
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS clients
                       (
                           id
                           SERIAL
                           PRIMARY
                           KEY,
                           name
                           TEXT
                           NOT
                           NULL,
                           email
                           TEXT,
                           account_number
                           TEXT,
                           status
                           TEXT
                           DEFAULT
                           'gray',
                           folder_path
                           TEXT
                       )
                       ''')

        # 2. Таблица USERS
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS users
                       (
                           id
                           SERIAL
                           PRIMARY
                           KEY,
                           username
                           VARCHAR
                       (
                           50
                       ) UNIQUE NOT NULL,
                           password_hash VARCHAR
                       (
                           255
                       ) NOT NULL,
                           department VARCHAR
                       (
                           50
                       ) DEFAULT 'Back Office',
                           is_admin BOOLEAN DEFAULT FALSE
                           )
                       ''')

        # --- CLIENT ACCOUNTS (ежемесячные счета клиента) ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS client_accounts_monthly (
                id SERIAL PRIMARY KEY,
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                exchange TEXT NOT NULL,
                currency TEXT NOT NULL,
                balance NUMERIC,
                period VARCHAR(7) NOT NULL, -- YYYY-MM (например 2026-01)
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # --- CRYPTO ACCOUNTS ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crypto_accounts (
                id SERIAL PRIMARY KEY,
                provider TEXT NOT NULL,
                name TEXT NOT NULL,
                asset TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # --- CRYPTO TRANSFERS ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crypto_transfers (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('transfer','deposit','withdraw')),
                from_account_id INTEGER NULL REFERENCES crypto_accounts(id) ON DELETE SET NULL,
                to_account_id INTEGER NULL REFERENCES crypto_accounts(id) ON DELETE SET NULL,
                asset TEXT NOT NULL,
                amount NUMERIC NOT NULL,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # --- FLOW SCHEMES (ReactFlow nodes/edges) ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crypto_flow_schemes (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                nodes JSONB NOT NULL,
                edges JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')




        try:
            cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(50) DEFAULT 'Back Office'")
        except Exception:
            conn.rollback()

        try:
            cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE")
        except Exception:
            conn.rollback()

        # 2.1 Таблица DEPARTMENTS
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS departments
                       (
                           id
                           SERIAL
                           PRIMARY
                           KEY,
                           name
                           VARCHAR
                       (
                           50
                       ) UNIQUE NOT NULL
                           )
                       ''')

        cursor.execute("SELECT COUNT(*) FROM departments")
        if cursor.fetchone()[0] == 0:
            default_depts = [("Back Office",), ("Trading",), ("Бухгалтерия",), ("Sales",)]
            cursor.executemany("INSERT INTO departments (name) VALUES (%s)", default_depts)

        # 3. Таблица TASKS
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS tasks
                       (
                           id
                           SERIAL
                           PRIMARY
                           KEY,
                           title
                           TEXT
                           NOT
                           NULL,
                           description
                           TEXT,
                           from_user_id
                           INTEGER,
                           to_department
                           TEXT
                           NOT
                           NULL,
                           status
                           TEXT
                           DEFAULT
                           'Open',
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           FOREIGN
                           KEY
                       (
                           from_user_id
                       ) REFERENCES users
                       (
                           id
                       )
                           )
                       ''')

        # 4. Таблица COMMENTS
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS comments
                       (
                           id
                           SERIAL
                           PRIMARY
                           KEY,
                           task_id
                           INTEGER,
                           user_id
                           INTEGER,
                           content
                           TEXT
                           NOT
                           NULL,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           FOREIGN
                           KEY
                       (
                           task_id
                       ) REFERENCES tasks
                       (
                           id
                       ) ON DELETE CASCADE,
                           FOREIGN KEY
                       (
                           user_id
                       ) REFERENCES users
                       (
                           id
                       )
                           )
                       ''')

        # 5. Таблица TASK_ATTACHMENTS
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS task_attachments
                       (
                           id
                           SERIAL
                           PRIMARY
                           KEY,
                           task_id
                           INTEGER,
                           filename
                           TEXT
                           NOT
                           NULL,
                           file_path
                           TEXT
                           NOT
                           NULL,
                           uploaded_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           FOREIGN
                           KEY
                       (
                           task_id
                       ) REFERENCES tasks
                       (
                           id
                       ) ON DELETE CASCADE
                           )
                       ''')

        conn.commit()
        log.info("БД инициализирована успешно.")
    except Exception as e:
        log.error(f"Ошибка инициализации БД: {e}")
        conn.rollback()
    finally:
        conn.close()


def search_clients(search_term=""):
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        if search_term:
            term = f"%{search_term}%"
            cursor.execute(
                "SELECT id, name, status FROM clients WHERE name ILIKE %s OR account_number ILIKE %s ORDER BY name",
                (term, term))
        else:
            cursor.execute("SELECT id, name, status FROM clients ORDER BY name")

        results_dict = cursor.fetchall()
        return [(row['id'], row['name'], row['status']) for row in results_dict]
    finally:
        conn.close()


def get_client_details(client_id):
    conn = get_db_connection()
    if not conn: return None
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM clients WHERE id = %s", (client_id,))
        row = cursor.fetchone()
        if row: return dict(row)
        return None
    finally:
        conn.close()



def add_client(name, email, account, folder_path_override=None):
    if not name: return False, "Имя клиента обязательно."

    final_folder_path = folder_path_override
    if not final_folder_path:
        base_dir = os.path.join(os.getcwd(), "client_reports")
        os.makedirs(base_dir, exist_ok=True)
        safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c == ' ']).rstrip()
        final_folder_path = os.path.join(base_dir, safe_name)

    if not os.path.exists(final_folder_path):
        try:
            os.makedirs(final_folder_path)
        except OSError as e:
            return False, f"Ошибка создания папки: {e}"

    conn = get_db_connection()
    if not conn: return False, "Ошибка БД"
    try:
        cursor = conn.cursor()
        cursor.execute('''
                       INSERT INTO clients (name, email, account_number, folder_path, status)
                       VALUES (%s, %s, %s, %s, 'gray')
                       ''', (name, email, account, final_folder_path))
        conn.commit()
        return True, "Клиент успешно добавлен."
    except Exception as e:
        return False, f"Ошибка БД: {e}"
    finally:
        conn.close()


def update_client(client_id, name, email, account, folder_path):
    conn = get_db_connection()
    if not conn: return False, "Ошибка БД"
    try:
        cursor = conn.cursor()
        cursor.execute('''
                       UPDATE clients
                       SET name           = %s,
                           email          = %s,
                           account_number = %s,
                           folder_path    = %s
                       WHERE id = %s
                       ''', (name, email, account, folder_path, client_id))
        conn.commit()
        return True, "Данные обновлены."
    except Exception as e:
        return False, str(e)
    finally:
        conn.close()


def update_client_status(client_id, new_status):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE clients SET status = %s WHERE id = %s", (new_status, client_id))
        conn.commit()
        return True
    except Exception as e:
        return False
    finally:
        conn.close()


def delete_client(client_id):
    conn = get_db_connection()
    if not conn: return False, "Ошибка БД"
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM clients WHERE id = %s", (client_id,))
        conn.commit()
        return True, "Клиент удален."
    except Exception as e:
        return False, str(e)
    finally:
        conn.close()


def get_user_by_username(username):
    conn = get_db_connection()
    if not conn: return None
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, password_hash, department, is_admin FROM users WHERE username = %s",
                       (username,))
        return cursor.fetchone()
    finally:
        conn.close()


def create_task(title, description, from_user_id, to_department):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("""
                       INSERT INTO tasks (title, description, from_user_id, to_department)
                       VALUES (%s, %s, %s, %s) RETURNING id
                       """, (title, description, from_user_id, to_department))
        task_id = cursor.fetchone()[0]
        conn.commit()
        return task_id
    except Exception as e:
        log.error(f"Create task error: {e}")
        return None
    finally:
        conn.close()


def get_tasks_by_dept(department):
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
                       SELECT t.*, u.username as author_name, u.department as author_dept
                       FROM tasks t
                                LEFT JOIN users u ON t.from_user_id = u.id
                       WHERE t.to_department = %s
                       ORDER BY t.created_at DESC
                       """, (department,))
        return cursor.fetchall()
    finally:
        conn.close()


def update_task(task_id, title, description):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        # МЫ УБРАЛИ: , updated_at = NOW()
        cursor.execute("""
            UPDATE tasks 
            SET title = %s, description = %s
            WHERE id = %s
        """, (title, description, task_id))
        conn.commit()
        return True
    except Exception as e:
        log.error(f"Error updating task: {e}")
        return False
    finally:
        conn.close()


def update_task_status(task_id, new_status):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE tasks SET status = %s WHERE id = %s", (new_status, task_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def update_task_content(task_id, title, description):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE tasks SET title = %s, description = %s WHERE id = %s", (title, description, task_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def delete_task(task_id):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()

        # 1. Сначала удаляем комментарии
        cursor.execute("DELETE FROM comments WHERE task_id = %s", (task_id,))

        # 2. Удаляем файлы (записи в БД)
        cursor.execute("DELETE FROM task_attachments WHERE task_id = %s", (task_id,))

        # 3. И только потом саму задачу
        cursor.execute("DELETE FROM tasks WHERE id = %s", (task_id,))

        conn.commit()
        return True
    except Exception as e:
        log.error(f"Error deleting task: {e}")
        conn.rollback()  # Важно откатить транзакцию при ошибке
        return False
    finally:
        conn.close()


def add_comment(task_id, user_id, content):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO comments (task_id, user_id, content) VALUES (%s, %s, %s)",
                       (task_id, user_id, content))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def get_comments(task_id):
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
                       SELECT c.*, u.username, u.department
                       FROM comments c
                                JOIN users u ON c.user_id = u.id
                       WHERE c.task_id = %s
                       ORDER BY c.created_at ASC
                       """, (task_id,))
        return cursor.fetchall()
    finally:
        conn.close()


def update_user_password(user_id, new_password_hash):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_password_hash, user_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def get_user_stats(user_id):
    conn = get_db_connection()
    if not conn: return {"created": 0, "completed": 0}
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE from_user_id = %s", (user_id,))
        created = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE from_user_id = %s AND status = 'Done'", (user_id,))
        completed = cursor.fetchone()[0]
        return {"created": created, "completed": completed}
    finally:
        conn.close()


def get_dashboard_stats():
    conn = get_db_connection()
    if not conn: return None
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        total_users = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM tasks")
        total_tasks = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE status != 'Done'")
        active_tasks = cursor.fetchone()[0]

        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
                       SELECT t.title, t.status, t.created_at, u.username
                       FROM tasks t
                                JOIN users u ON t.from_user_id = u.id
                       ORDER BY t.created_at DESC LIMIT 5
                       """)
        recent = cursor.fetchall()
        return {"users": total_users, "total_tasks": total_tasks, "active_tasks": active_tasks,
                "recent_tasks": [dict(r) for r in recent]}
    finally:
        conn.close()


def get_all_users():
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT id, username, department, is_admin FROM users ORDER BY id")
        return cursor.fetchall()
    finally:
        conn.close()


def create_new_user(username, password_hash, department, is_admin=False):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, password_hash, department, is_admin) VALUES (%s, %s, %s, %s)",
            (username, password_hash, department, is_admin)
        )
        conn.commit()
        return True
    except Exception as e:
        log.error(f"Error creating user: {e}")
        return False
    finally:
        conn.close()


def delete_user(user_id):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM comments WHERE user_id = %s", (user_id,))
        cursor.execute("DELETE FROM tasks WHERE from_user_id = %s", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def get_all_departments():
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM departments ORDER BY id")
        return cursor.fetchall()
    finally:
        conn.close()


def add_department(name):
    conn = get_db_connection()
    if not conn: return False, "Ошибка БД"
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO departments (name) VALUES (%s)", (name,))
        conn.commit()
        return True, "Отдел создан"
    except Exception as e:
        return False, f"Ошибка: {e}"
    finally:
        conn.close()


def delete_department(dept_id):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM departments WHERE id = %s", (dept_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def rename_department(dept_id, new_name):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM departments WHERE id = %s", (dept_id,))
        res = cursor.fetchone()
        if not res: return False
        old_name = res[0]

        cursor.execute("UPDATE departments SET name = %s WHERE id = %s", (new_name, dept_id))
        cursor.execute("UPDATE users SET department = %s WHERE department = %s", (new_name, old_name))
        cursor.execute("UPDATE tasks SET to_department = %s WHERE to_department = %s", (new_name, old_name))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def add_task_attachment(task_id, filename, file_path):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO task_attachments (task_id, filename, file_path) VALUES (%s, %s, %s)",
            (task_id, filename, file_path)
        )
        conn.commit()
        return True
    except Exception as e:
        log.error(f"Ошибка сохранения вложения: {e}")
        return False
    finally:
        conn.close()


def get_task_attachments(task_id):
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM task_attachments WHERE task_id = %s ORDER BY uploaded_at DESC", (task_id,))
        return cursor.fetchall()
    finally:
        conn.close()


def delete_task_attachment(attachment_id):
    conn = get_db_connection()
    if not conn: return False
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM task_attachments WHERE id = %s", (attachment_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def get_attachment_by_id(attachment_id):
    conn = get_db_connection()
    if not conn: return None
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM task_attachments WHERE id = %s", (attachment_id,))
        return cursor.fetchone()
    finally:
        conn.close()


def reset_all_clients_statuses():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE clients SET status = 'gray'")
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error resetting statuses: {e}")
        return False

def get_user_tasks(user_id):
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT t.*, u.username as author_name, u.department as author_dept
            FROM tasks t
            LEFT JOIN users u ON t.from_user_id = u.id
            WHERE t.from_user_id = %s
            ORDER BY t.created_at DESC
        """, (user_id,))
        return cursor.fetchall()
    finally:
        conn.close()


def get_client_accounts_monthly(client_id: int, period: str):
    conn = get_db_connection()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, exchange, currency, balance, period
            FROM client_accounts_monthly
            WHERE client_id = %s AND period = %s
            ORDER BY id DESC
        """, (client_id, period))
        return cur.fetchall()
    finally:
        conn.close()


def add_client_account_monthly(client_id: int, exchange: str, currency: str, balance, period: str):
    conn = get_db_connection()
    if not conn: return None
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO client_accounts_monthly (client_id, exchange, currency, balance, period)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (client_id, exchange, currency, balance, period))
        new_id = cur.fetchone()[0]
        conn.commit()
        return new_id
    finally:
        conn.close()


def delete_client_account_monthly(account_id: int):
    conn = get_db_connection()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM client_accounts_monthly WHERE id = %s", (account_id,))
        conn.commit()
        return True
    finally:
        conn.close()

def get_crypto_accounts():
    conn = get_db_connection()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, provider, name, asset FROM crypto_accounts ORDER BY id DESC")
        return cur.fetchall()
    finally:
        conn.close()


def create_crypto_account(provider: str, name: str, asset: str = ""):
    conn = get_db_connection()
    if not conn: return None
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO crypto_accounts (provider, name, asset)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (provider, name, asset))
        new_id = cur.fetchone()[0]
        conn.commit()
        return new_id
    finally:
        conn.close()


def update_crypto_account(acc_id: int, provider: str, name: str, asset: str = ""):
    conn = get_db_connection()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE crypto_accounts
            SET provider=%s, name=%s, asset=%s
            WHERE id=%s
        """, (provider, name, asset, acc_id))
        conn.commit()
        return True
    finally:
        conn.close()


def delete_crypto_account(acc_id: int):
    conn = get_db_connection()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM crypto_accounts WHERE id=%s", (acc_id,))
        conn.commit()
        return True
    finally:
        conn.close()

def get_crypto_transfers(limit: int = 200):
    conn = get_db_connection()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, date, type, from_account_id, to_account_id, asset, amount, comment
            FROM crypto_transfers
            ORDER BY date DESC, id DESC
            LIMIT %s
        """, (limit,))
        return cur.fetchall()
    finally:
        conn.close()


def create_crypto_transfer(date, tx_type: str, from_id, to_id, asset: str, amount, comment: str = ""):
    conn = get_db_connection()
    if not conn: return None
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO crypto_transfers (date, type, from_account_id, to_account_id, asset, amount, comment)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (date, tx_type, from_id, to_id, asset, amount, comment))
        new_id = cur.fetchone()[0]
        conn.commit()
        return new_id
    finally:
        conn.close()

def get_crypto_flow_schemes():
    conn = get_db_connection()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, name, nodes, edges, created_at
            FROM crypto_flow_schemes
            ORDER BY id DESC
        """)
        return cur.fetchall()
    finally:
        conn.close()


def create_crypto_flow_scheme(name: str, nodes, edges):
    conn = get_db_connection()
    if not conn: return None
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO crypto_flow_schemes (name, nodes, edges)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (name, Json(nodes), Json(edges)))
        new_id = cur.fetchone()[0]
        conn.commit()
        return new_id
    finally:
        conn.close()


def delete_crypto_flow_scheme(scheme_id: int):
    conn = get_db_connection()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM crypto_flow_schemes WHERE id=%s", (scheme_id,))
        conn.commit()
        return True
    finally:
        conn.close()
