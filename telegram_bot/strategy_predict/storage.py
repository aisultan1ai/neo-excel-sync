import logging
import sqlite3
from contextlib import contextmanager
from threading import Lock

from .config import DB_PATH

log = logging.getLogger(__name__)

_lock = Lock()
_initialized = False


@contextmanager
def get_conn():
    with _lock:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        try:
            yield conn
        finally:
            conn.close()


SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS trades (
        execution_id     TEXT PRIMARY KEY,
        trade_id         TEXT,
        account_id       TEXT NOT NULL,
        instrument_id    INTEGER,
        ticker           TEXT NOT NULL,
        side             TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
        amount           REAL NOT NULL,
        price            REAL NOT NULL,
        quote_amount     REAL,
        commission       REAL,
        closed_pnl       REAL,
        transact_time    TEXT NOT NULL,      -- ISO 8601 UTC
        trade_date       TEXT NOT NULL,      -- YYYY-MM-DD (UTC)
        source           TEXT NOT NULL DEFAULT 'unity_api',
        raw_json         TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_trades_account_date ON trades(account_id, trade_date)",
    "CREATE INDEX IF NOT EXISTS idx_trades_ticker_date  ON trades(ticker, trade_date)",

    """
    CREATE TABLE IF NOT EXISTS positions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id       TEXT NOT NULL,
        ticker           TEXT NOT NULL,
        open_execution_id TEXT NOT NULL,
        open_date        TEXT NOT NULL,      -- YYYY-MM-DD
        open_price       REAL NOT NULL,
        amount_open      REAL NOT NULL,      -- знак сохраняем (buy: +, sell-short: -)
        amount_remaining REAL NOT NULL,
        close_date       TEXT,               -- NULL если ещё открыта
        realized_pnl     REAL DEFAULT 0.0
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(ticker, close_date)",

    """
    CREATE TABLE IF NOT EXISTS daily_prices (
        ticker TEXT NOT NULL,
        date   TEXT NOT NULL,               -- YYYY-MM-DD
        open   REAL, high REAL, low REAL, close REAL,
        adj_close REAL, volume REAL,
        PRIMARY KEY(ticker, date)
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS features (
        ticker     TEXT NOT NULL,
        as_of_date TEXT NOT NULL,           -- YYYY-MM-DD (последний закрытый день)
        payload    TEXT NOT NULL,           -- JSON dict фич
        PRIMARY KEY(ticker, as_of_date)
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS predictions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        target_date      TEXT NOT NULL,     -- YYYY-MM-DD торговый день, на который прогноз
        made_at          TEXT NOT NULL,     -- ISO 8601 UTC когда посчитали
        ticker           TEXT NOT NULL,
        side             TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
        confidence       REAL NOT NULL,
        rank             INTEGER NOT NULL,
        rule_version     TEXT NOT NULL,
        rationale_json   TEXT               -- JSON с фичами/вкладом правила
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(target_date, rank)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_predictions_day_ticker "
    "ON predictions(target_date, ticker, rule_version)",

    """
    CREATE TABLE IF NOT EXISTS reconciliations (
        date            TEXT NOT NULL,      -- YYYY-MM-DD (день, для которого считали факт)
        rule_version    TEXT NOT NULL,
        n_predicted     INTEGER NOT NULL,
        n_actual        INTEGER NOT NULL,
        n_overlap       INTEGER NOT NULL,   -- совпадение только по тикеру
        n_side_match    INTEGER NOT NULL,   -- совпадение (тикер + side)
        precision_      REAL NOT NULL,
        recall          REAL NOT NULL,
        f1              REAL NOT NULL,
        details_json    TEXT,               -- разметка: hits/misses/extras
        PRIMARY KEY(date, rule_version)
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS ml_models (
        side            TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
        model_version   TEXT NOT NULL,        -- 'xgb-1.0', 'xgb-2.0', ...
        trained_at      TEXT NOT NULL,        -- ISO 8601 UTC
        n_train         INTEGER NOT NULL,
        n_positive      INTEGER NOT NULL,
        feature_names   TEXT NOT NULL,        -- JSON list
        metrics_json    TEXT NOT NULL,        -- pr_auc, precision_at_k, f1, ...
        path            TEXT NOT NULL,        -- относительно DATA_DIR
        PRIMARY KEY(side, model_version)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ml_models_side_time "
    "ON ml_models(side, trained_at DESC)",
]


def _pk_columns(conn, table: str) -> list[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [r["name"] for r in rows if r["pk"]]


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def _migrate_ml_models_pk(conn) -> None:
    if not _table_exists(conn, "ml_models"):
        return
    pk = _pk_columns(conn, "ml_models")
    if set(pk) == {"side", "model_version"}:
        return
    log.info("strategy_predict: миграция ml_models PK %s -> (side, model_version)", pk)
    conn.execute("ALTER TABLE ml_models RENAME TO ml_models__legacy_v1")
    conn.execute("""
        CREATE TABLE ml_models (
            side            TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
            model_version   TEXT NOT NULL,
            trained_at      TEXT NOT NULL,
            n_train         INTEGER NOT NULL,
            n_positive      INTEGER NOT NULL,
            feature_names   TEXT NOT NULL,
            metrics_json    TEXT NOT NULL,
            path            TEXT NOT NULL,
            PRIMARY KEY(side, model_version)
        )
    """)
    conn.execute("""
        INSERT INTO ml_models
            (side, model_version, trained_at, n_train, n_positive,
             feature_names, metrics_json, path)
        SELECT side, model_version, trained_at, n_train, n_positive,
               feature_names, metrics_json, path
        FROM ml_models__legacy_v1
    """)
    conn.execute("DROP TABLE ml_models__legacy_v1")


def _migrate_reconciliations_pk(conn) -> None:
    if not _table_exists(conn, "reconciliations"):
        return
    pk = _pk_columns(conn, "reconciliations")
    if set(pk) == {"date", "rule_version"}:
        return
    log.info("strategy_predict: миграция reconciliations PK %s -> (date, rule_version)", pk)
    conn.execute("ALTER TABLE reconciliations RENAME TO reconciliations__legacy_v1")
    conn.execute("""
        CREATE TABLE reconciliations (
            date            TEXT NOT NULL,
            rule_version    TEXT NOT NULL,
            n_predicted     INTEGER NOT NULL,
            n_actual        INTEGER NOT NULL,
            n_overlap       INTEGER NOT NULL,
            n_side_match    INTEGER NOT NULL,
            precision_      REAL NOT NULL,
            recall          REAL NOT NULL,
            f1              REAL NOT NULL,
            details_json    TEXT,
            PRIMARY KEY(date, rule_version)
        )
    """)
    conn.execute("""
        INSERT INTO reconciliations
            (date, rule_version, n_predicted, n_actual, n_overlap, n_side_match,
             precision_, recall, f1, details_json)
        SELECT date, rule_version, n_predicted, n_actual, n_overlap, n_side_match,
               precision_, recall, f1, details_json
        FROM reconciliations__legacy_v1
    """)
    conn.execute("DROP TABLE reconciliations__legacy_v1")


def init_db() -> None:
    global _initialized
    if _initialized:
        return
    with get_conn() as conn:
        _migrate_ml_models_pk(conn)
        _migrate_reconciliations_pk(conn)
        for stmt in SCHEMA:
            conn.execute(stmt)
    _initialized = True
    log.info("strategy_predict: SQLite инициализирована в %s", DB_PATH)
