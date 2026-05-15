import logging

from core.database import get_db_connection, safe_ddl

log = logging.getLogger(__name__)


def init_database():
    conn = get_db_connection()
    if not conn:
        return
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS clients (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT,
                    account_number TEXT,
                    status TEXT DEFAULT 'gray',
                    folder_path TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    department VARCHAR(50) DEFAULT 'Back Office',
                    is_admin BOOLEAN DEFAULT FALSE
                )
            """)
            safe_ddl(cur, "ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(50) DEFAULT 'Back Office'")
            safe_ddl(cur, "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS departments (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL
                )
            """)
            cur.execute("SELECT COUNT(*) FROM departments")
            if (cur.fetchone() or [0])[0] == 0:
                cur.executemany(
                    "INSERT INTO departments (name) VALUES (%s)",
                    [("Back Office",), ("Trading",), ("Бухгалтерия",), ("Sales",)],
                )

            cur.execute("""
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
            """)
            safe_ddl(cur, "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS to_user_id INTEGER")
            safe_ddl(cur, "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_by_user_id INTEGER")
            safe_ddl(cur, "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP")
            safe_ddl(cur, "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE")
            safe_ddl(cur, "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'")
            safe_ddl(cur, """
                DO $$
                BEGIN
                  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_to_user_fk') THEN
                    ALTER TABLE tasks ADD CONSTRAINT tasks_to_user_fk FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL;
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_accepted_by_fk') THEN
                    ALTER TABLE tasks ADD CONSTRAINT tasks_accepted_by_fk FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
                  END IF;
                END$$;
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_tasks_to_dept ON tasks(to_department)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_tasks_accepted_by ON tasks(accepted_by_user_id)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_tasks_to_user ON tasks(to_user_id)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS comments (
                    id SERIAL PRIMARY KEY,
                    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id)")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS task_attachments (
                    id SERIAL PRIMARY KEY,
                    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                    filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id)")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS problems (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_problems_created_at ON problems(created_at DESC)")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS crypto_accounts (
                    id SERIAL PRIMARY KEY,
                    provider TEXT NOT NULL,
                    name TEXT NOT NULL,
                    asset TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_crypto_accounts_created_at ON crypto_accounts(created_at DESC)")

            cur.execute("""
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
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_crypto_transfers_date ON crypto_transfers(date DESC)")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS crypto_schemes (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    nodes JSONB NOT NULL,
                    edges JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_crypto_schemes_created_at ON crypto_schemes(created_at DESC)")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS podft_snapshots (
                    id SERIAL PRIMARY KEY,
                    snapshot_date DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT
                )
            """)
            cur.execute("""
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
            """)
            safe_ddl(cur, "ALTER TABLE podft_snapshot_trades ADD COLUMN IF NOT EXISTS raw JSONB")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_podft_snapshots_date ON podft_snapshots(snapshot_date)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_snapshot ON podft_snapshot_trades(snapshot_id)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_value_date ON podft_snapshot_trades(value_date)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_podft_snapshot_trades_created_at ON podft_snapshot_trades(created_at DESC)")

        log.info("Core DB initialized.")
    except Exception as e:
        log.error("init_database error: %s", e, exc_info=True)
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


def init_ff_tables():
    conn = get_db_connection()
    if not conn:
        return
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ff_sub_accounts (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    api_key_enc TEXT NOT NULL,
                    api_secret_enc TEXT NOT NULL,
                    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ff_funding_records (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER NOT NULL REFERENCES ff_sub_accounts(id) ON DELETE CASCADE,
                    symbol TEXT NOT NULL,
                    asset TEXT NOT NULL,
                    income DOUBLE PRECISION NOT NULL,
                    income_type TEXT NOT NULL,
                    tran_id BIGINT UNIQUE NOT NULL,
                    time_ms BIGINT NOT NULL,
                    datetime_utc TIMESTAMP WITH TIME ZONE NOT NULL,
                    date_local DATE NOT NULL,
                    loaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_ff_records_account ON ff_funding_records(account_id)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_ff_records_symbol ON ff_funding_records(symbol)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_ff_records_date ON ff_funding_records(date_local)")
        log.info("FF tables initialized.")
    except Exception as e:
        log.error("init_ff_tables error: %s", e, exc_info=True)
    finally:
        conn.close()


def init_cashout_tables():
    conn = get_db_connection()
    if not conn:
        return
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ff_unity_config (
                    id SERIAL PRIMARY KEY,
                    base_url TEXT NOT NULL DEFAULT '',
                    auth_token_enc TEXT NOT NULL DEFAULT '',
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ff_cashout_mappings (
                    id SERIAL PRIMARY KEY,
                    ff_account_id INTEGER NOT NULL REFERENCES ff_sub_accounts(id) ON DELETE CASCADE,
                    unity_account_id INTEGER NOT NULL,
                    unity_real_account_id INTEGER NOT NULL,
                    unity_asset_id INTEGER NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(ff_account_id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ff_cashout_history (
                    id SERIAL PRIMARY KEY,
                    ff_account_id INTEGER NOT NULL REFERENCES ff_sub_accounts(id) ON DELETE CASCADE,
                    amount DOUBLE PRECISION NOT NULL,
                    netting_date DATE NOT NULL,
                    start_date DATE,
                    end_date DATE,
                    transaction_id TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    comment TEXT,
                    internal_comment TEXT,
                    error_message TEXT,
                    triggered_by TEXT NOT NULL DEFAULT 'manual',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    created_by_user_id INTEGER REFERENCES users(id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ff_cashout_schedules (
                    id SERIAL PRIMARY KEY,
                    ff_account_id INTEGER NOT NULL REFERENCES ff_sub_accounts(id) ON DELETE CASCADE,
                    frequency TEXT NOT NULL DEFAULT 'monthly',
                    day_of_period INTEGER NOT NULL DEFAULT 1,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    last_run_date DATE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(ff_account_id)
                )
            """)
            safe_ddl(cur, "ALTER TABLE ff_cashout_history ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'cashout'")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_co_hist_account ON ff_cashout_history(ff_account_id)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_co_hist_created ON ff_cashout_history(created_at)")
            safe_ddl(cur, "ALTER TABLE ff_unity_config ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
            safe_ddl(cur, "CREATE UNIQUE INDEX IF NOT EXISTS uq_unity_config_owner ON ff_unity_config(owner_id) WHERE owner_id IS NOT NULL")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ff_audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    username TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_audit_action  ON ff_audit_log(action)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_audit_user    ON ff_audit_log(user_id)")
            safe_ddl(cur, "CREATE INDEX IF NOT EXISTS idx_audit_created ON ff_audit_log(created_at DESC)")
        log.info("Cashout tables initialized.")
    except Exception as e:
        log.error("init_cashout_tables error: %s", e, exc_info=True)
    finally:
        conn.close()


def init_all():
    init_database()
    init_ff_tables()
    init_cashout_tables()
