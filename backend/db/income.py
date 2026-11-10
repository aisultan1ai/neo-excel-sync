"""Хранилище раздела «Доходы»: кэш данных Unity, справочник счетов, курсы, настройки, загрузки."""
from __future__ import annotations

import logging
from datetime import date

from psycopg2.extras import RealDictCursor, execute_values

from core.database import get_db, to_jsonb

log = logging.getLogger(__name__)

DDL = [
    """CREATE TABLE IF NOT EXISTS inc_accounts (
        account_id BIGINT PRIMARY KEY,
        name TEXT,
        client_profile_id BIGINT,
        client_profile_name TEXT,
        provider_profile_id BIGINT,
        account_relation TEXT,
        accounting_type TEXT,
        management_type TEXT,
        status TEXT,
        unity_updated_at TIMESTAMPTZ DEFAULT NOW(),
        -- ручные настройки (загрузка из Unity их не трогает)
        role TEXT,                       -- NULL = авто | client | provider
        excluded BOOLEAN NOT NULL DEFAULT FALSE,
        provider_label TEXT,
        profile_label TEXT,
        note TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS inc_assets (
        id BIGINT PRIMARY KEY,
        code TEXT,
        asset_type TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS inc_instruments (
        id BIGINT PRIMARY KEY,
        ticker TEXT,
        code TEXT,
        name TEXT,
        category TEXT,
        base_asset_id BIGINT,
        quote_asset_id BIGINT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS inc_trades (
        id TEXT PRIMARY KEY,
        account_id BIGINT NOT NULL,
        instrument_id BIGINT,
        side TEXT,
        amount NUMERIC,
        quote_amount NUMERIC,
        price NUMERIC,
        commission NUMERIC,
        markup_amount NUMERIC,
        closed_pnl NUMERIC,
        order_id TEXT,
        position_id TEXT,
        transact_time TIMESTAMPTZ,
        trade_date DATE NOT NULL,
        value_date DATE,
        comment TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_inc_trades_date ON inc_trades(trade_date)",
    "CREATE INDEX IF NOT EXISTS idx_inc_trades_acc_date ON inc_trades(account_id, trade_date)",
    "CREATE INDEX IF NOT EXISTS idx_inc_trades_order ON inc_trades(order_id)",
    """CREATE TABLE IF NOT EXISTS inc_transactions (
        id TEXT PRIMARY KEY,
        type TEXT,
        sub_type TEXT,
        asset_id BIGINT,
        amount NUMERIC,
        debit_account_id BIGINT,
        credit_account_id BIGINT,
        instrument_id BIGINT,
        trade_id TEXT,
        parent_id TEXT,
        transact_date DATE NOT NULL,
        transact_time TIMESTAMPTZ,
        comment TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_inc_tx_date ON inc_transactions(transact_date)",
    """CREATE TABLE IF NOT EXISTS inc_order_details (
        order_id TEXT PRIMARY KEY,
        account_id BIGINT,
        executions JSONB NOT NULL DEFAULT '[]'::jsonb,
        fetched_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS inc_fx_rates (
        month DATE NOT NULL,
        currency TEXT NOT NULL,
        rate NUMERIC NOT NULL,
        mode TEXT NOT NULL DEFAULT 'USDCCY',
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (month, currency)
    )""",
    """CREATE TABLE IF NOT EXISTS inc_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS inc_sync_runs (
        id SERIAL PRIMARY KEY,
        date_from DATE NOT NULL,
        date_to DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        progress TEXT,
        stats JSONB DEFAULT '{}'::jsonb,
        error TEXT,
        started_by TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
    )""",
]

_ACC_UNITY_COLS = ("name", "client_profile_id", "client_profile_name", "provider_profile_id",
                   "account_relation", "accounting_type", "management_type", "status")
_ACC_MANUAL_COLS = ("role", "excluded", "provider_label", "profile_label", "note")


def init_tables():
    with get_db() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for sql in DDL:
                cur.execute(sql)
    log.info("Income tables initialized.")


# ── Счета ────────────────────────────────────────────────────────────────────

def upsert_accounts(rows: list[dict]) -> int:
    if not rows:
        return 0
    cols = ("account_id",) + _ACC_UNITY_COLS
    values = [tuple(r.get(c) for c in cols) for r in rows]
    sets = ", ".join(f"{c}=EXCLUDED.{c}" for c in _ACC_UNITY_COLS) + ", unity_updated_at=NOW()"
    with get_db() as conn:
        with conn.cursor() as cur:
            execute_values(cur, f"INSERT INTO inc_accounts ({', '.join(cols)}) VALUES %s "
                                f"ON CONFLICT (account_id) DO UPDATE SET {sets}", values, page_size=1000)
        conn.commit()
    return len(values)


def list_accounts() -> list[dict]:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM inc_accounts ORDER BY account_id")
            return [dict(r) for r in cur.fetchall()]


def update_accounts(account_ids: list[int], changes: dict) -> int:
    changes = {k: v for k, v in changes.items() if k in _ACC_MANUAL_COLS}
    if not account_ids or not changes:
        return 0
    sets = ", ".join(f"{k}=%s" for k in changes)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE inc_accounts SET {sets} WHERE account_id = ANY(%s)",
                        list(changes.values()) + [list(account_ids)])
            n = cur.rowcount
        conn.commit()
    return n


def ensure_accounts(account_ids: list[int]) -> None:
    """Добавить счета вручную (если их ещё нет в справочнике)."""
    if not account_ids:
        return
    with get_db() as conn:
        with conn.cursor() as cur:
            execute_values(cur, "INSERT INTO inc_accounts (account_id) VALUES %s ON CONFLICT DO NOTHING",
                           [(a,) for a in account_ids])
        conn.commit()


# ── Справочники ──────────────────────────────────────────────────────────────

def upsert_assets(rows: list[dict]) -> None:
    if not rows:
        return
    with get_db() as conn:
        with conn.cursor() as cur:
            execute_values(cur, "INSERT INTO inc_assets (id, code, asset_type) VALUES %s ON CONFLICT (id) "
                                "DO UPDATE SET code=EXCLUDED.code, asset_type=EXCLUDED.asset_type",
                           [(r["id"], r.get("code"), r.get("assetType")) for r in rows], page_size=1000)
        conn.commit()


def assets_map() -> dict:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, code FROM inc_assets")
            return {r[0]: r[1] for r in cur.fetchall()}


def upsert_instruments(rows: list[dict]) -> None:
    if not rows:
        return
    vals = [(r["id"], r.get("ticker"), r.get("code"), r.get("name"), r.get("category"),
             r.get("baseAssetId"), r.get("quoteAssetId")) for r in rows]
    with get_db() as conn:
        with conn.cursor() as cur:
            execute_values(cur, """INSERT INTO inc_instruments (id, ticker, code, name, category, base_asset_id, quote_asset_id)
                                   VALUES %s ON CONFLICT (id) DO UPDATE SET ticker=EXCLUDED.ticker, code=EXCLUDED.code,
                                   name=EXCLUDED.name, category=EXCLUDED.category, base_asset_id=EXCLUDED.base_asset_id,
                                   quote_asset_id=EXCLUDED.quote_asset_id, updated_at=NOW()""", vals, page_size=1000)
        conn.commit()


def known_instrument_ids() -> set:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM inc_instruments")
            return {r[0] for r in cur.fetchall()}


def instruments_map(ids=None) -> dict:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if ids is None:
                cur.execute("SELECT * FROM inc_instruments")
            else:
                cur.execute("SELECT * FROM inc_instruments WHERE id = ANY(%s)", (list(ids),))
            return {r["id"]: dict(r) for r in cur.fetchall()}


# ── Сделки и транзакции ──────────────────────────────────────────────────────

_TRADE_COLS = ("id", "account_id", "instrument_id", "side", "amount", "quote_amount", "price", "commission",
               "markup_amount", "closed_pnl", "order_id", "position_id", "transact_time", "trade_date",
               "value_date", "comment")
_TX_COLS = ("id", "type", "sub_type", "asset_id", "amount", "debit_account_id", "credit_account_id",
            "instrument_id", "trade_id", "parent_id", "transact_date", "transact_time", "comment")


def replace_trades(date_from: str, date_to: str, rows: list[tuple]) -> None:
    """Перезаписать сделки периода одним транзакционным блоком."""
    with get_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM inc_trades WHERE trade_date BETWEEN %s AND %s", (date_from, date_to))
                if rows:
                    sets = ", ".join(f"{c}=EXCLUDED.{c}" for c in _TRADE_COLS[1:])
                    execute_values(cur, f"INSERT INTO inc_trades ({', '.join(_TRADE_COLS)}) VALUES %s "
                                        f"ON CONFLICT (id) DO UPDATE SET {sets}", rows, page_size=2000)
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def replace_transactions(date_from: str, date_to: str, rows: list[tuple]) -> None:
    with get_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM inc_transactions WHERE transact_date BETWEEN %s AND %s", (date_from, date_to))
                if rows:
                    sets = ", ".join(f"{c}=EXCLUDED.{c}" for c in _TX_COLS[1:])
                    execute_values(cur, f"INSERT INTO inc_transactions ({', '.join(_TX_COLS)}) VALUES %s "
                                        f"ON CONFLICT (id) DO UPDATE SET {sets}", rows, page_size=2000)
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def fetched_order_ids(order_ids: list[str]) -> set:
    if not order_ids:
        return set()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT order_id FROM inc_order_details WHERE order_id = ANY(%s)", (list(order_ids),))
            return {r[0] for r in cur.fetchall()}


def save_order_details(order_id: str, account_id, executions: list) -> None:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO inc_order_details (order_id, account_id, executions) VALUES (%s, %s, %s)
                           ON CONFLICT (order_id) DO UPDATE SET executions=EXCLUDED.executions, fetched_at=NOW()""",
                        (order_id, account_id, to_jsonb(executions)))
        conn.commit()


def load_period(date_from: str, date_to: str) -> dict:
    """Всё, что нужно расчёту, одним проходом по БД."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""SELECT id, account_id, instrument_id, side, amount::float8 AS amount,
                                  quote_amount::float8 AS quote_amount, price::float8 AS price,
                                  commission::float8 AS commission, markup_amount::float8 AS markup_amount,
                                  order_id, transact_time, trade_date
                           FROM inc_trades WHERE trade_date BETWEEN %s AND %s""", (date_from, date_to))
            trades = [dict(r) for r in cur.fetchall()]

            cur.execute("""SELECT id, type, sub_type, asset_id, amount::float8 AS amount, debit_account_id,
                                  credit_account_id, instrument_id, trade_id, transact_date, comment
                           FROM inc_transactions WHERE transact_date BETWEEN %s AND %s""", (date_from, date_to))
            transactions = [dict(r) for r in cur.fetchall()]

            order_ids = list({t["order_id"] for t in trades if t["order_id"]})
            executions = {}
            if order_ids:
                cur.execute("SELECT order_id, executions FROM inc_order_details WHERE order_id = ANY(%s)", (order_ids,))
                executions = {r["order_id"]: r["executions"] or [] for r in cur.fetchall()}

            cur.execute("SELECT * FROM inc_accounts")
            accounts = {r["account_id"]: dict(r) for r in cur.fetchall()}

    instr_ids = {t["instrument_id"] for t in trades if t["instrument_id"] is not None}
    return {
        "period": {"from": str(date_from), "to": str(date_to)},
        "accounts": accounts,
        "instruments": instruments_map(instr_ids),
        "assets": assets_map(),
        "trades": trades,
        "transactions": transactions,
        "executions": executions,
    }


def transaction_summary(date_from: str, date_to: str) -> list[dict]:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""SELECT t.type, t.sub_type, COALESCE(a.code, t.asset_id::text) AS currency,
                                  COUNT(*) AS cnt, SUM(t.amount)::float8 AS amount
                           FROM inc_transactions t LEFT JOIN inc_assets a ON a.id = t.asset_id
                           WHERE t.transact_date BETWEEN %s AND %s
                           GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""", (date_from, date_to))
            return [dict(r) for r in cur.fetchall()]


def trades_per_account(date_from: str, date_to: str) -> list[dict]:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""SELECT account_id, COUNT(*) AS trades FROM inc_trades
                           WHERE trade_date BETWEEN %s AND %s GROUP BY 1 ORDER BY 2 DESC""", (date_from, date_to))
            return [dict(r) for r in cur.fetchall()]


# ── Курсы ────────────────────────────────────────────────────────────────────

def get_rates(month: date) -> dict:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT currency, rate::float8 AS rate, mode, updated_by, updated_at FROM inc_fx_rates "
                        "WHERE month = %s ORDER BY currency", (month,))
            return {r["currency"]: dict(r) for r in cur.fetchall()}


def save_rates(month: date, rows: list[dict], username: str) -> None:
    with get_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM inc_fx_rates WHERE month = %s", (month,))
                vals = [(month, r["currency"].upper(), r["rate"], r["mode"], username) for r in rows]
                if vals:
                    execute_values(cur, "INSERT INTO inc_fx_rates (month, currency, rate, mode, updated_by) VALUES %s", vals)
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def latest_rates_before(month: date) -> tuple[date | None, dict]:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(month) FROM inc_fx_rates WHERE month < %s", (month,))
            prev = (cur.fetchone() or [None])[0]
    return prev, (get_rates(prev) if prev else {})


# ── Настройки ────────────────────────────────────────────────────────────────

def get_setting(key: str) -> dict | None:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM inc_settings WHERE key = %s", (key,))
            row = cur.fetchone()
            return row[0] if row else None


def save_setting(key: str, value: dict) -> None:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO inc_settings (key, value) VALUES (%s, %s) "
                        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (key, to_jsonb(value)))
        conn.commit()


# ── Загрузки ─────────────────────────────────────────────────────────────────

def create_run(date_from: str, date_to: str, username: str) -> int | None:
    """None — уже идёт другая загрузка (зависшие > 3 ч считаются упавшими)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE inc_sync_runs SET status='error', error='Прервано (перезапуск сервера?)', finished_at=NOW()
                           WHERE status='running' AND started_at < NOW() - INTERVAL '3 hours'""")
            cur.execute("SELECT id FROM inc_sync_runs WHERE status='running' LIMIT 1")
            if cur.fetchone():
                conn.commit()
                return None
            cur.execute("INSERT INTO inc_sync_runs (date_from, date_to, started_by, progress) VALUES (%s, %s, %s, %s) RETURNING id",
                        (date_from, date_to, username, "Старт"))
            run_id = cur.fetchone()[0]
        conn.commit()
    return run_id


def fail_stale_runs() -> None:
    """При старте сервера все «running» — прерванные."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE inc_sync_runs SET status='error', error='Прервано перезапуском сервера', "
                        "finished_at=NOW() WHERE status='running'")
        conn.commit()


def update_run(run_id: int, **fields) -> None:
    if not fields:
        return
    if "stats" in fields:
        fields["stats"] = to_jsonb(fields["stats"])
    sets = ", ".join(f"{k}=%s" for k in fields)
    if fields.get("status") in ("done", "error"):
        sets += ", finished_at=NOW()"
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE inc_sync_runs SET {sets} WHERE id=%s", list(fields.values()) + [run_id])
        conn.commit()


def get_run(run_id: int) -> dict | None:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM inc_sync_runs WHERE id=%s", (run_id,))
            r = cur.fetchone()
            return dict(r) if r else None


def list_runs(limit: int = 30) -> list[dict]:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM inc_sync_runs ORDER BY id DESC LIMIT %s", (limit,))
            return [dict(r) for r in cur.fetchall()]


def loaded_periods() -> list[dict]:
    """Успешно загруженные периоды (последняя загрузка по каждому)."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""SELECT DISTINCT ON (date_from, date_to) id, date_from, date_to, finished_at, started_by, stats
                           FROM inc_sync_runs WHERE status='done'
                           ORDER BY date_from, date_to, id DESC""")
            rows = [dict(r) for r in cur.fetchall()]
    rows.sort(key=lambda r: r["date_from"], reverse=True)
    return rows
