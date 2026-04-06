from app.db.connection import get_db_connection
from app.core.security import get_password_hash
from app.core.config import settings


def init_database():
    conn = get_db_connection()
    conn.autocommit = True

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS departments (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    department VARCHAR(100) DEFAULT 'Architecture Lab',
                    is_admin BOOLEAN DEFAULT FALSE
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS clients (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT DEFAULT '',
                    account_number TEXT DEFAULT '',
                    status TEXT DEFAULT 'gray',
                    folder_path TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tasks (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    to_department VARCHAR(100) NOT NULL,
                    to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    status VARCHAR(50) DEFAULT 'Open',
                    priority VARCHAR(20) DEFAULT 'normal',
                    due_date DATE NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
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

            cur.execute(
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

            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_to_department ON tasks(to_department)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_from_user_id ON tasks(from_user_id)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON task_attachments(task_id)"
            )

            cur.execute("SELECT COUNT(*) FROM departments")
            dept_count = cur.fetchone()[0]

            if dept_count == 0:
                cur.executemany(
                    "INSERT INTO departments (name) VALUES (%s)",
                    [
                        ("Architecture Lab",),
                        ("Back Office",),
                        ("Trading",),
                        ("Бухгалтерия",),
                        ("Sales",),
                    ],
                )

            cur.execute("SELECT COUNT(*) FROM users")
            user_count = cur.fetchone()[0]

            if user_count == 0:
                cur.execute(
                    """
                    INSERT INTO users (username, password_hash, department, is_admin)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        settings.INIT_ADMIN_USERNAME,
                        get_password_hash(settings.INIT_ADMIN_PASSWORD),
                        settings.INIT_ADMIN_DEPARTMENT,
                        settings.INIT_ADMIN_IS_ADMIN,
                    ),
                )
    finally:
        conn.close()