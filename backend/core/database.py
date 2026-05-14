from __future__ import annotations

import json
import logging
import os
import threading
from contextlib import contextmanager
from datetime import date as _date, datetime
from decimal import Decimal
from typing import Generator

import psycopg2
import psycopg2.pool
from psycopg2.extras import Json, register_default_json, register_default_jsonb

register_default_json(loads=json.loads, globally=True)
register_default_jsonb(loads=json.loads, globally=True)

log = logging.getLogger(__name__)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()


def _json_default(o):
    if isinstance(o, (_date, datetime)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, set):
        return list(o)
    return str(o)


def _json_dumps(obj):
    return json.dumps(obj, ensure_ascii=False, default=_json_default)


def to_jsonb(obj):
    return Json(obj, dumps=_json_dumps)


def _build_db_config() -> dict | None:
    dbname = os.getenv("POSTGRES_DB")
    user = os.getenv("POSTGRES_USER")
    password = os.getenv("POSTGRES_PASSWORD")

    if not dbname or not user or not password:
        log.error("DB env vars missing. Need POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD.")
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


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool | None:
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is not None:
            return _pool
        cfg = _build_db_config()
        if not cfg:
            return None
        try:
            max_conn = int(os.getenv("DB_POOL_MAX", "20"))
            _pool = psycopg2.pool.ThreadedConnectionPool(minconn=2, maxconn=max_conn, **cfg)
            log.info("DB connection pool created (max=%d)", max_conn)
        except Exception as e:
            log.error("Failed to create DB pool: %s", e, exc_info=True)
    return _pool


class _PooledConn:
    """Wraps a psycopg2 connection so close() returns it to the pool instead of terminating."""

    __slots__ = ("_conn", "_pool", "_closed")

    def __init__(self, conn, pool):
        object.__setattr__(self, "_conn", conn)
        object.__setattr__(self, "_pool", pool)
        object.__setattr__(self, "_closed", False)

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_conn"), name)

    def __setattr__(self, name, value):
        if name in ("_conn", "_pool", "_closed"):
            object.__setattr__(self, name, value)
        else:
            setattr(object.__getattribute__(self, "_conn"), name, value)

    def cursor(self, *args, **kwargs):
        return object.__getattribute__(self, "_conn").cursor(*args, **kwargs)

    def commit(self):
        object.__getattribute__(self, "_conn").commit()

    def rollback(self):
        object.__getattribute__(self, "_conn").rollback()

    def set_client_encoding(self, enc):
        object.__getattribute__(self, "_conn").set_client_encoding(enc)

    def close(self):
        if object.__getattribute__(self, "_closed"):
            return
        object.__setattr__(self, "_closed", True)
        conn = object.__getattribute__(self, "_conn")
        pool = object.__getattribute__(self, "_pool")
        try:
            pool.putconn(conn)
        except Exception as e:
            log.warning("putconn error: %s", e)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


def get_db_connection() -> _PooledConn | None:
    pool = _get_pool()
    if not pool:
        return None
    try:
        conn = pool.getconn()
        conn.set_client_encoding("UTF8")
        return _PooledConn(conn, pool)
    except Exception as e:
        log.error("DB getconn error: %s", e, exc_info=True)
        return None


@contextmanager
def get_db() -> Generator[_PooledConn, None, None]:
    """Context manager for DB connections — preferred for new code."""
    conn = get_db_connection()
    if conn is None:
        raise RuntimeError("Could not obtain DB connection from pool")
    try:
        yield conn
    finally:
        conn.close()


def safe_ddl(cur, sql: str) -> None:
    try:
        cur.execute(sql)
    except Exception as e:
        first_line = (sql.splitlines() or [""])[0]
        log.warning("DDL skipped/failed: %s | err=%s", first_line[:120], e)
