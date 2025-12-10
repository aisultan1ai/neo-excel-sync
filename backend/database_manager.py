# BackEnd/database_manager.py
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import logging

log = logging.getLogger(__name__)

# НАСТРОЙКИ ПОДКЛЮЧЕНИЯ
# В реальном проекте эти данные лучше хранить в .env файле
DB_CONFIG = {
    "dbname": "neo_db",  # Имя базы данных
    "user": "postgres",  # Ваше имя пользователя в Postgres (обычно postgres)
    "password": "aisu123",  # ВАШ ПАРОЛЬ ОТ POSTGRES
    "host": "localhost",  # Адрес сервера (localhost, если база на том же компе)
    "port": 5432
}


def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        log.error(f"Ошибка подключения к БД: {e}")
        return None


def init_database():
    """Создает таблицы клиентов и пользователей в PostgreSQL."""
    conn = get_db_connection()
    if not conn:
        return
    try:
        cursor = conn.cursor()

        # 1. Таблица КЛИЕНТОВ (Ваш старый код)
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

        # 2. Таблица ПОЛЬЗОВАТЕЛЕЙ (НОВАЯ)
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
                       ) NOT NULL
                           )
                       ''')

        conn.commit()
        log.info("Таблицы clients и users проверены/созданы.")
    except Exception as e:
        log.error(f"Ошибка инициализации БД: {e}")
    finally:
        conn.close()


# --- ФУНКЦИИ ПОИСКА И ПРОСМОТРА ---

def search_clients(search_term=""):
    conn = get_db_connection()
    if not conn: return []

    # Используем RealDictCursor, чтобы получать результат как словарь, а не кортеж
    cursor = conn.cursor(cursor_factory=RealDictCursor)  # !! Важно для совместимости с кодом

    # В Postgres LIKE чувствителен к регистру, ILIKE - нет (лучше для поиска)
    if search_term:
        term = f"%{search_term}%"
        cursor.execute(
            "SELECT id, name, status FROM clients WHERE name ILIKE %s OR account_number ILIKE %s ORDER BY name",
            (term, term))
    else:
        cursor.execute("SELECT id, name, status FROM clients ORDER BY name")

    # Преобразуем RealDictRow в обычные кортежи, так как ваш main.py ожидает кортежи (id, name, status)
    # Или можно переписать main.py, но проще адаптировать тут:
    results_dict = cursor.fetchall()
    conn.close()

    # Конвертируем обратно в формат списка кортежей для совместимости с текущим main.py
    results = [(row['id'], row['name'], row['status']) for row in results_dict]
    return results


def get_client_details(client_id):
    conn = get_db_connection()
    if not conn: return None
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    cursor.execute("SELECT * FROM clients WHERE id = %s", (client_id,))
    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return None


# --- ФУНКЦИИ ДОБАВЛЕНИЯ И ОБНОВЛЕНИЯ ---

def add_client(name, email, account, folder_path_override=None):
    if not name:
        return False, "Имя клиента обязательно."

    # Логика папок остается прежней (храним на сервере)
    final_folder_path = folder_path_override
    if not final_folder_path:
        base_dir = os.path.join(os.getcwd(), "client_reports")
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)
        safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c == ' ']).rstrip()
        final_folder_path = os.path.join(base_dir, safe_name)

    if not os.path.exists(final_folder_path):
        try:
            os.makedirs(final_folder_path)
        except OSError as e:
            return False, f"Ошибка создания папки: {e}"

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # В Postgres используем %s вместо ?
        cursor.execute('''
                       INSERT INTO clients (name, email, account_number, folder_path, status)
                       VALUES (%s, %s, %s, %s, 'gray')
                       ''', (name, email, account, final_folder_path))
        conn.commit()
        conn.close()
        return True, "Клиент успешно добавлен."
    except Exception as e:
        log.error(f"Ошибка добавления в БД: {e}")
        return False, f"Ошибка БД: {e}"


def update_client(client_id, name, email, account, folder_path):
    try:
        conn = get_db_connection()
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
        conn.close()
        return True, "Данные клиента обновлены."
    except Exception as e:
        log.error(f"Ошибка обновления клиента: {e}")
        return False, str(e)


def update_client_status(client_id, new_status):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE clients SET status = %s WHERE id = %s", (new_status, client_id))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        log.error(f"Ошибка смены статуса: {e}")
        return False


def reset_all_client_statuses():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE clients SET status = 'gray'")
        conn.commit()
        conn.close()
        return True, "Все статусы сброшены."
    except Exception as e:
        return False, f"Ошибка: {e}"


def delete_client(client_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM clients WHERE id = %s", (client_id,))
        conn.commit()
        conn.close()
        return True, "Клиент удален."
    except Exception as e:
        log.error(f"Ошибка удаления: {e}")
        return False, str(e)

def get_user_by_username(username):
    """Ищет пользователя по логину для авторизации."""
    conn = get_db_connection()  # <--- ДОЛЖНО БЫТЬ ТАК
    if not conn:
        return None

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, password_hash FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        return user
    except Exception as e:
        log.error(f"Ошибка поиска пользователя: {e}")
        return None
    finally:
        conn.close()