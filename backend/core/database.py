from __future__ import annotations

import json
import logging
import os
from datetime import date as _date, datetime
from decimal import Decimal

import psycopg2
from psycopg2.extras import Json, register_default_json, register_default_jsonb

register_default_json(loads=json.loads, globally=True)
register_default_jsonb(loads=json.loads, globally=True)

log = logging.getLogger(__name__)


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


def get_db_connection():
    cfg = _build_db_config()
    if not cfg:
        return None
    try:
        conn = psycopg2.connect(**cfg)
        conn.set_client_encoding("UTF8")
        return conn
    except Exception as e:
        log.error("DB connection error: %s", e, exc_info=True)
        return None


def safe_ddl(cur, sql: str) -> None:
    try:
        cur.execute(sql)
    except Exception as e:
        first_line = (sql.splitlines() or [""])[0]
        log.warning("DDL skipped/failed: %s | err=%s", first_line[:120], e)
