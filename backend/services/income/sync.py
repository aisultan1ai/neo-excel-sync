"""Загрузка данных Unity за период в локальную БД (фоновой задачей).

Экономия лимитов Unity:
  * счета/активы — постранично по 500, это дёшево;
  * сделки и транзакции — одним окном на весь период, по группам счетов
    (исключённые счета не запрашиваются вовсе);
  * инструменты — только новые (которых ещё нет в кэше);
  * orderDetails (Execution ID) — только по нужным ордерам, один раз на ордер,
    с лимитом на загрузку;
  * все запросы строго последовательно (общий замок в services.unity), на 429
    ждём сколько скажет Unity.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from datetime import date

from db import income as income_db
from services import unity
from .rules import classify_instrument, effective_role, merge_settings

log = logging.getLogger(__name__)

PAGE = 500
_MAX_LIMIT_WAIT_S = 15 * 60


class SyncCancelled(Exception):
    pass


class _Ctx:
    def __init__(self, run_id: int, base_url: str, token: str):
        self.run_id = run_id
        self.base_url = base_url
        self.token = token
        self.calls = 0
        self._last_progress = 0.0

    def progress(self, text: str, force: bool = False):
        now = time.monotonic()
        if force or now - self._last_progress > 1.5:
            self._last_progress = now
            income_db.update_run(self.run_id, progress=text)

    def get(self, endpoint: str, params: dict) -> dict:
        """unity._get + терпеливое ожидание длинных лимитов (минутный/дневной)."""
        waited = 0.0
        while True:
            try:
                self.calls += 1
                return unity._get(self.base_url, self.token, endpoint, params) or {}
            except unity.UnityRateLimitError as e:
                m = re.search(r"через (\d+)", str(e))
                wait = float(m.group(1)) if m else 60.0
                if waited + wait > _MAX_LIMIT_WAIT_S:
                    raise
                self.progress(f"Лимит Unity API — жду {int(wait)} с…", force=True)
                time.sleep(wait)
                waited += wait


def _pages(ctx: _Ctx, endpoint: str, params: dict, label: str, items_key: str = "items"):
    offset = 0
    while True:
        data = ctx.get(endpoint, {**params, "offset": offset, "limit": PAGE})
        page = data.get(items_key) or []
        total = data.get("total")
        offset += len(page)
        ctx.progress(f"{label}: {offset}{f' из {total}' if total is not None else ''}")
        yield from page
        if not page or (total is None and len(page) < PAGE) or (total is not None and offset >= total):
            break


def _csv(values) -> str:
    return ",".join(str(v) for v in values)


def _chunks(seq: list, n: int):
    for i in range(0, len(seq), max(1, n)):
        yield seq[i:i + n]


def _num(v):
    return None if v in (None, "") else v


# ── Шаги ─────────────────────────────────────────────────────────────────────

def sync_accounts(ctx: _Ctx) -> int:
    rows = []
    for a in _pages(ctx, "/api/v1/accounts", {"dir": "ASC"}, "Счета"):
        full = " ".join(p for p in (a.get("firstName"), a.get("lastName")) if p)
        rows.append({
            "account_id": a.get("accountId"),
            "name": a.get("name") or full or a.get("description"),
            "client_profile_id": a.get("clientProfileId"),
            "client_profile_name": a.get("clientProfileName"),
            "provider_profile_id": a.get("providerProfileId"),
            "account_relation": a.get("accountRelation"),
            "accounting_type": a.get("accountingType"),
            "management_type": a.get("managementType"),
            "status": a.get("status"),
        })
    rows = [r for r in rows if r["account_id"] is not None]
    income_db.upsert_accounts(rows)
    return len(rows)


def sync_assets(ctx: _Ctx) -> int:
    rows = []
    offset = 0
    while True:
        data = ctx.get("/api/v1/assets", {"offset": offset, "limit": PAGE})
        page = data.get("assets") or data.get("items") or []
        rows.extend(page)
        offset += len(page)
        total = data.get("total")
        if not page or (total is not None and offset >= total):
            break
    income_db.upsert_assets([r for r in rows if r.get("id") is not None])
    return len(rows)


def _trade_row(t: dict) -> tuple:
    return (
        str(t.get("id")), t.get("accountId"), t.get("instrumentId"), t.get("side"),
        _num(t.get("amount")), _num(t.get("quoteAmount")), _num(t.get("price")), _num(t.get("commission")),
        _num(t.get("markupAmount")), _num(t.get("closedPnl")),
        str(t["orderId"]) if t.get("orderId") is not None else None,
        str(t["positionId"]) if t.get("positionId") is not None else None,
        t.get("transactTime"), t.get("tradeDate"), t.get("valueDate"), t.get("comment"),
    )


def _tx_row(x: dict) -> tuple:
    ref = x.get("ref") or {}
    return (
        str(x.get("id")), x.get("transactionType"), x.get("transactionSubType"), x.get("assetId"),
        _num(x.get("amount")), x.get("debitAccountId"), x.get("creditAccountId"), ref.get("instrumentId"),
        str(ref["tradeId"]) if ref.get("tradeId") is not None else None,
        str(ref["parentId"]) if ref.get("parentId") is not None else None,
        x.get("transactDate"), x.get("transactTime"), x.get("comment"),
    )


def sync_trades(ctx: _Ctx, account_ids: list, date_from: str, date_to: str, settings: dict) -> list:
    rows, seen = [], set()
    groups = list(_chunks(account_ids, int(settings["accounts_per_request"])))
    for i, part in enumerate(groups, 1):
        params = {"accountId": _csv(part), "fromTradeDate": date_from, "toTradeDate": date_to, "dir": "ASC"}
        if settings.get("trade_types"):
            params["tradeType"] = _csv(settings["trade_types"])
        for t in _pages(ctx, "/api/v1/trades", params, f"Сделки (группа {i}/{len(groups)})"):
            tid = str(t.get("id"))
            if tid in seen or not t.get("tradeDate"):
                continue
            seen.add(tid)
            rows.append(_trade_row(t))
    income_db.replace_trades(date_from, date_to, rows)
    return rows


def sync_transactions(ctx: _Ctx, account_ids: list, date_from: str, date_to: str, settings: dict) -> int:
    if not settings.get("transaction_types"):
        income_db.replace_transactions(date_from, date_to, [])
        return 0
    rows, seen = [], set()
    groups = list(_chunks(account_ids, int(settings["accounts_per_request"])))
    for i, part in enumerate(groups, 1):
        params = {"accountId": _csv(part), "from": date_from, "to": date_to, "dir": "ASC",
                  "transactionType": _csv(settings["transaction_types"])}
        for x in _pages(ctx, "/api/v1/transactions", params, f"Транзакции (группа {i}/{len(groups)})"):
            xid = str(x.get("id"))
            if xid in seen or not x.get("transactDate"):
                continue
            seen.add(xid)
            rows.append(_tx_row(x))
    income_db.replace_transactions(date_from, date_to, rows)
    return len(rows)


def sync_instruments(ctx: _Ctx, instrument_ids: set) -> int:
    missing = sorted(i for i in instrument_ids if i is not None and i not in income_db.known_instrument_ids())
    if not missing:
        return 0
    got = []
    for part in _chunks(missing, 100):
        ctx.progress(f"Инструменты: {len(got)} из {len(missing)}")
        data = ctx.get("/api/v1/instrumentDetails", {"instrumentId": _csv(part), "offset": 0, "limit": len(part)})
        got.extend(data.get("items") or [])
    income_db.upsert_instruments(got)
    return len(got)


def sync_order_details(ctx: _Ctx, trade_rows: list, accounts: dict, settings: dict) -> dict:
    """Execution ID для сделок клиентов (конвертации или все — по настройке)."""
    instruments = income_db.instruments_map()
    scope = settings.get("order_details_scope") or "conversion"
    orders = {}
    for r in trade_rows:
        tid, account_id, instrument_id, order_id = r[0], r[1], r[2], r[10]
        if not order_id or effective_role(accounts.get(account_id)) != "client":
            continue
        if scope != "all" and classify_instrument(instruments.get(instrument_id), settings) != "conversion":
            continue
        orders[order_id] = account_id
    already = income_db.fetched_order_ids(list(orders))
    need = [o for o in orders if o not in already]
    limit = int(settings.get("order_details_limit") or 0)
    skipped = max(0, len(need) - limit)
    need = need[:limit]
    done = 0
    for order_id in need:
        ctx.progress(f"Execution ID: {done} из {len(need)}")
        try:
            data = ctx.get(f"/api/v1/orderDetails/{order_id}", {})
        except Exception as e:
            log.warning("orderDetails %s: %s", order_id, e)
            continue
        execs = [{
            "execution_id": str(e.get("executionId")) if e.get("executionId") is not None else None,
            "remote_order_id": str(e.get("remoteOrderId")) if e.get("remoteOrderId") is not None else None,
            "remote_execution_id": str(e.get("remoteExecutionId")) if e.get("remoteExecutionId") is not None else None,
        } for e in (data.get("executions") or [])]
        income_db.save_order_details(order_id, orders[order_id], execs)
        done += 1
    return {"orders_needed": len(orders), "fetched": done, "skipped_by_limit": skipped}


# ── Запуск ───────────────────────────────────────────────────────────────────

def run_sync(run_id: int, base_url: str, token: str, date_from: str, date_to: str) -> None:
    ctx = _Ctx(run_id, base_url, token)
    started = time.monotonic()
    stats: dict = {}
    try:
        settings = merge_settings(income_db.get_setting("rules"))

        ctx.progress("Счета Unity…", force=True)
        stats["accounts_total"] = sync_accounts(ctx)
        ctx.progress("Валюты…", force=True)
        stats["assets"] = sync_assets(ctx)

        accounts = {a["account_id"]: a for a in income_db.list_accounts()}
        load_ids = sorted(aid for aid, a in accounts.items() if not a.get("excluded"))
        stats["accounts_loaded"] = len(load_ids)
        stats["accounts_excluded"] = len(accounts) - len(load_ids)

        trade_rows = sync_trades(ctx, load_ids, date_from, date_to, settings)
        stats["trades"] = len(trade_rows)

        stats["instruments_new"] = sync_instruments(ctx, {r[2] for r in trade_rows})
        stats["transactions"] = sync_transactions(ctx, load_ids, date_from, date_to, settings)
        stats["order_details"] = sync_order_details(ctx, trade_rows, accounts, settings)

        stats["api_calls"] = ctx.calls
        stats["seconds"] = round(time.monotonic() - started, 1)
        income_db.update_run(run_id, status="done", progress="Готово", stats=stats)
        log.info("Income sync %s done: %s", run_id, stats)
    except Exception as e:
        log.error("Income sync %s failed: %s", run_id, e, exc_info=True)
        stats["api_calls"] = ctx.calls
        text = str(e)
        resp = getattr(e, "response", None)
        if resp is not None:
            text = f"Unity API {resp.status_code}: {resp.text[:300]}"
        income_db.update_run(run_id, status="error", error=text[:1000], stats=stats)


def start_sync(base_url: str, token: str, date_from: date, date_to: date, username: str) -> int | None:
    run_id = income_db.create_run(date_from.isoformat(), date_to.isoformat(), username)
    if run_id is None:
        return None
    threading.Thread(
        target=run_sync, args=(run_id, base_url, token, date_from.isoformat(), date_to.isoformat()),
        name=f"income-sync-{run_id}", daemon=True,
    ).start()
    return run_id
