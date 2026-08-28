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
                """
                CREATE TABLE IF NOT EXISTS podft_snapshots (
                    id SERIAL PRIMARY KEY,
                    snapshot_date DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS podft_snapshot_trades (
                    id SERIAL PRIMARY KEY,
                    snapshot_id INTEGER NOT NULL REFERENCES podft_snapshots(id) ON DELETE CASCADE,
                    row_hash TEXT NOT NULL,
                    account TEXT,
                    instrument TEXT,
                    side TEXT,
                    trading_dt TEXT,
                    deal_dt TEXT,
                    value_date DATE NOT NULL,
                    qty NUMERIC,
                    amount_tg NUMERIC,
                    raw JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(snapshot_id, row_hash)
                )
                """
            )

            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshots_date ON podft_snapshots(snapshot_date)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_snapshot ON podft_snapshot_trades(snapshot_id)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_value_date ON podft_snapshot_trades(value_date)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_created_at ON podft_snapshot_trades(created_at DESC)"
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

            cur.execute(
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
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_crypto_accounts_created_at ON crypto_accounts(created_at DESC)"
            )

            cur.execute(
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
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_crypto_transfers_date ON crypto_transfers(date DESC)"
            )

            cur.execute(
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
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_crypto_schemes_created_at ON crypto_schemes(created_at DESC)"
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