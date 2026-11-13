"""История крипто-транзакций: разделы (редактируемые) и транзакции в них."""
from __future__ import annotations

import logging

from psycopg2.extras import RealDictCursor, execute_values

from core.database import get_db

log = logging.getLogger(__name__)

# Разделы по умолчанию — как блоки в исходном Excel. code нужен, чтобы импорт узнавал блоки
# по ключевым словам, даже если раздел потом переименуют.
DEFAULT_SECTIONS = [
    ("deposit_exchange", "Пополнения из иностранных бирж", "in", 10),
    ("deposit_wallet", "Пополнения из кошельков", "in", 20),
    ("withdraw_exchange", "Вывод на иностранные биржи", "out", 30),
    ("withdraw_wallet", "Вывод на кошельки", "out", 40),
]

DDL = [
    """CREATE TABLE IF NOT EXISTS crypto_tx_sections (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'in',          -- in = пополнение, out = вывод
        counterparty_label TEXT,                       -- подпись колонки; пусто = «Откуда»/«Куда»
        sort_order INTEGER NOT NULL DEFAULT 100,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_tx_section_name ON crypto_tx_sections (lower(name))",
    """CREATE TABLE IF NOT EXISTS crypto_transactions (
        id SERIAL PRIMARY KEY,
        section_id INTEGER NOT NULL REFERENCES crypto_tx_sections(id),
        tx_time TIMESTAMP NOT NULL,
        counterparty TEXT,
        amount NUMERIC NOT NULL,
        asset TEXT,
        tx_hash TEXT,
        comment TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_crypto_tx_time ON crypto_transactions(tx_time)",
    "CREATE INDEX IF NOT EXISTS idx_crypto_tx_section ON crypto_transactions(section_id)",
    # один и тот же хэш в одном разделе — дубль (повторный импорт файла)
    """CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_tx_section_hash ON crypto_transactions(section_id, tx_hash)
       WHERE tx_hash IS NOT NULL AND tx_hash <> ''""",
]

_TX_COLS = ("t.id, t.section_id, t.tx_time, t.counterparty, t.amount::float8 AS amount, t.asset, t.tx_hash, "
            "t.comment, t.source, t.created_by, t.created_at, t.updated_by, t.updated_at")
_SEC_COLS = "id, code, name, direction, counterparty_label, sort_order, archived, created_by, created_at"


class SectionError(Exception):
    pass


def init_tables():
    with get_db() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for sql in DDL:
                cur.execute(sql)
            # стандартные разделы — только при самом первом запуске, чтобы удалённые не возвращались
            cur.execute("SELECT COUNT(*) FROM crypto_tx_sections")
            if cur.fetchone()[0] == 0:
                for code, name, direction, order in DEFAULT_SECTIONS:
                    cur.execute("""INSERT INTO crypto_tx_sections (code, name, direction, sort_order, created_by)
                                   VALUES (%s, %s, %s, %s, 'system') ON CONFLICT DO NOTHING""",
                                (code, name, direction, order))
    log.info("Crypto transactions tables initialized.")


# ── Разделы ──────────────────────────────────────────────────────────────────

def list_sections() -> list[dict]:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"""SELECT {_SEC_COLS},
                                   (SELECT COUNT(*) FROM crypto_transactions t WHERE t.section_id = s.id) AS tx_count
                            FROM crypto_tx_sections s ORDER BY sort_order, id""")
            return [dict(r) for r in cur.fetchall()]


def get_section(section_id: int) -> dict | None:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"SELECT {_SEC_COLS} FROM crypto_tx_sections WHERE id = %s", (section_id,))
            r = cur.fetchone()
            return dict(r) if r else None


def _name_key(name: str) -> str:
    return " ".join((name or "").split()).casefold().replace("ё", "е")


def _name_taken(cur, name: str, exclude_id: int | None = None) -> bool:
    # сравниваем в Python: lower() в Postgres не переводит кириллицу при локали C
    cur.execute("SELECT name FROM crypto_tx_sections WHERE id <> %s", (exclude_id or 0,))
    key = _name_key(name)
    return any(_name_key(r["name"] if isinstance(r, dict) else r[0]) == key for r in cur.fetchall())


def create_section(data: dict, username: str) -> dict:
    with get_db() as conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if _name_taken(cur, data["name"]):
                    raise SectionError("Раздел с таким названием уже есть")
                cur.execute("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM crypto_tx_sections")
                order = data.get("sort_order") or cur.fetchone()["n"]
                cur.execute(f"""INSERT INTO crypto_tx_sections (name, direction, counterparty_label, sort_order, created_by)
                                VALUES (%s, %s, %s, %s, %s) RETURNING {_SEC_COLS}""",
                            (data["name"], data["direction"], data.get("counterparty_label"), order, username))
                out = dict(cur.fetchone())
            conn.commit()
            return out
        except Exception:
            conn.rollback()
            raise


def update_section(section_id: int, data: dict) -> dict | None:
    fields = {k: data[k] for k in ("name", "direction", "counterparty_label", "sort_order", "archived") if k in data}
    if not fields:
        return get_section(section_id)
    with get_db() as conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if "name" in fields and _name_taken(cur, fields["name"], section_id):
                    raise SectionError("Раздел с таким названием уже есть")
                sets = ", ".join(f"{k} = %s" for k in fields)
                cur.execute(f"UPDATE crypto_tx_sections SET {sets} WHERE id = %s RETURNING {_SEC_COLS}",
                            list(fields.values()) + [section_id])
                r = cur.fetchone()
            conn.commit()
            return dict(r) if r else None
        except Exception:
            conn.rollback()
            raise


def delete_section(section_id: int, move_to: int | None) -> int:
    """Удаляет раздел. Если в нём есть транзакции — их нужно перенести (move_to).
    Возвращает число перенесённых транзакций."""
    with get_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM crypto_transactions WHERE section_id = %s", (section_id,))
                n = cur.fetchone()[0]
                if n and not move_to:
                    raise SectionError(f"В разделе {n} транзакций — выберите раздел, куда их перенести")
                if n:
                    if move_to == section_id:
                        raise SectionError("Нельзя перенести транзакции в тот же раздел")
                    cur.execute("SELECT 1 FROM crypto_tx_sections WHERE id = %s", (move_to,))
                    if not cur.fetchone():
                        raise SectionError("Раздел для переноса не найден")
                    cur.execute("""SELECT COUNT(*) FROM crypto_transactions a JOIN crypto_transactions b
                                   ON a.tx_hash = b.tx_hash AND a.tx_hash <> ''
                                   WHERE a.section_id = %s AND b.section_id = %s""", (section_id, move_to))
                    clash = cur.fetchone()[0]
                    if clash:
                        raise SectionError(f"{clash} транзакций с такими же хэшами уже есть в выбранном разделе — "
                                           f"перенос создал бы дубли")
                    cur.execute("UPDATE crypto_transactions SET section_id = %s WHERE section_id = %s", (move_to, section_id))
                cur.execute("DELETE FROM crypto_tx_sections WHERE id = %s", (section_id,))
                if cur.rowcount == 0:
                    raise SectionError("Раздел не найден")
            conn.commit()
            return n
        except Exception:
            conn.rollback()
            raise


# ── Транзакции ───────────────────────────────────────────────────────────────

def _where(date_from, date_to, section_id, q):
    sql, params = [], []
    if date_from:
        sql.append("t.tx_time >= %s::date")
        params.append(date_from)
    if date_to:
        sql.append("t.tx_time < (%s::date + INTERVAL '1 day')")
        params.append(date_to)
    if section_id:
        sql.append("t.section_id = %s")
        params.append(section_id)
    if q:
        sql.append("(t.counterparty ILIKE %s OR t.tx_hash ILIKE %s OR t.comment ILIKE %s OR t.asset ILIKE %s)")
        like = f"%{q}%"
        params += [like, like, like, like]
    return (" WHERE " + " AND ".join(sql)) if sql else "", params


def list_tx(date_from=None, date_to=None, section_id=None, q=None) -> list[dict]:
    where, params = _where(date_from, date_to, section_id, q)
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"SELECT {_TX_COLS} FROM crypto_transactions t{where} ORDER BY t.tx_time DESC, t.id DESC", params)
            return [dict(r) for r in cur.fetchall()]


def hash_exists(section_id: int, tx_hash: str | None, exclude_id: int | None = None) -> bool:
    if not tx_hash:
        return False
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM crypto_transactions WHERE section_id = %s AND tx_hash = %s AND id <> %s LIMIT 1",
                        (section_id, tx_hash, exclude_id or 0))
            return cur.fetchone() is not None


def create_tx(row: dict, username: str) -> dict:
    with get_db() as conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"""INSERT INTO crypto_transactions AS t
                        (section_id, tx_time, counterparty, amount, asset, tx_hash, comment, source, created_by)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, 'manual', %s) RETURNING {_TX_COLS}""",
                    (row["section_id"], row["tx_time"], row.get("counterparty"), row["amount"], row.get("asset"),
                     row.get("tx_hash"), row.get("comment"), username))
                out = dict(cur.fetchone())
            conn.commit()
            return out
        except Exception:
            conn.rollback()
            raise


def update_tx(tx_id: int, row: dict, username: str) -> dict | None:
    with get_db() as conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"""UPDATE crypto_transactions AS t SET section_id=%s, tx_time=%s, counterparty=%s, amount=%s,
                        asset=%s, tx_hash=%s, comment=%s, updated_by=%s, updated_at=NOW()
                        WHERE t.id=%s RETURNING {_TX_COLS}""",
                    (row["section_id"], row["tx_time"], row.get("counterparty"), row["amount"], row.get("asset"),
                     row.get("tx_hash"), row.get("comment"), username, tx_id))
                r = cur.fetchone()
            conn.commit()
            return dict(r) if r else None
        except Exception:
            conn.rollback()
            raise


def delete_tx(tx_id: int) -> bool:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM crypto_transactions WHERE id = %s", (tx_id,))
            n = cur.rowcount
        conn.commit()
    return n > 0


def import_rows(rows: list[dict], username: str) -> tuple[int, int]:
    """Добавляет строки импорта (с section_id). Дубли — тот же хэш в том же разделе, а без хэша —
    та же дата, контрагент и сумма — пропускаются. Возвращает (добавлено, пропущено)."""
    if not rows:
        return 0, 0
    added = 0
    with get_db() as conn:
        try:
            with conn.cursor() as cur:
                keep = [r for r in rows if r.get("tx_hash")]
                for r in (r for r in rows if not r.get("tx_hash")):
                    cur.execute("""SELECT 1 FROM crypto_transactions WHERE section_id=%s AND tx_time=%s
                                   AND COALESCE(counterparty,'')=COALESCE(%s,'') AND amount=%s LIMIT 1""",
                                (r["section_id"], r["tx_time"], r.get("counterparty"), r["amount"]))
                    if not cur.fetchone():
                        keep.append(r)
                values = [(r["section_id"], r["tx_time"], r.get("counterparty"), r["amount"], r.get("asset"),
                           r.get("tx_hash"), r.get("comment"), "import", username) for r in keep]
                if values:
                    res = execute_values(
                        cur,
                        """INSERT INTO crypto_transactions
                           (section_id, tx_time, counterparty, amount, asset, tx_hash, comment, source, created_by)
                           VALUES %s
                           ON CONFLICT (section_id, tx_hash) WHERE tx_hash IS NOT NULL AND tx_hash <> '' DO NOTHING
                           RETURNING id""",
                        values, page_size=1000, fetch=True)
                    added = len(res)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return added, len(rows) - added


def counterparties() -> dict:
    """Ранее встречавшиеся контрагенты по разделам — для подсказок в форме: {section_id: [имена]}."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT section_id, counterparty, COUNT(*) FROM crypto_transactions
                           WHERE counterparty IS NOT NULL AND counterparty <> ''
                           GROUP BY 1, 2 ORDER BY 3 DESC""")
            out: dict = {}
            for sid, name, _ in cur.fetchall():
                out.setdefault(sid, []).append(name)
            return out
