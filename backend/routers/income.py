"""Раздел «Доходы»: загрузка из Unity по кнопке за выбранный период, расчёт, справочники, Excel."""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from core.config import can_access_income
from core.deps import get_current_user
from db import income as income_db
from db import users as users_db
from routers.balance_history import _unity_cfg
from services.income import excel as income_excel
from services.income import sync as income_sync
from services.income.calc import compute_report
from services.income.rules import DEFAULT_SETTINGS, default_rate_mode, merge_settings, pair_label

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/income")

MAX_PERIOD_DAYS = 366


def require_income_access(current_user: str = Depends(get_current_user)) -> str:
    """Только логины из INCOME_USERS (.env). Права администратора доступа не дают."""
    if not can_access_income(current_user) or not users_db.get_user_by_username(current_user):
        raise HTTPException(403, "Раздел «Доходы» вам недоступен")
    return current_user


def _period(date_from: date, date_to: date) -> tuple[str, str]:
    if date_from > date_to:
        raise HTTPException(400, "Дата «с» больше даты «по»")
    if (date_to - date_from).days > MAX_PERIOD_DAYS:
        raise HTTPException(400, "Период не больше года")
    return date_from.isoformat(), date_to.isoformat()


def _rates_month(date_to: date) -> date:
    return date_to.replace(day=1)


def _rates_for_calc(month: date) -> dict:
    return {c: {"rate": r["rate"], "mode": r["mode"]} for c, r in income_db.get_rates(month).items()}


def _report(date_from: date, date_to: date) -> tuple[dict, dict, date]:
    f, t = _period(date_from, date_to)
    settings = merge_settings(income_db.get_setting("rules"))
    month = _rates_month(date_to)
    rates = _rates_for_calc(month)
    report = compute_report(income_db.load_period(f, t), settings, rates)
    report["rates_month"] = month.isoformat()
    return report, rates, month


# ── Загрузка из Unity (только по кнопке) ─────────────────────────────────────

class SyncRequest(BaseModel):
    date_from: date
    date_to: date


@router.post("/sync")
def start_sync(req: SyncRequest, current_user: str = Depends(require_income_access)):
    _period(req.date_from, req.date_to)
    base_url, token = _unity_cfg(current_user)
    run_id = income_sync.start_sync(base_url, token, req.date_from, req.date_to, current_user)
    if run_id is None:
        raise HTTPException(409, "Загрузка уже идёт — дождитесь окончания")
    return {"run_id": run_id}


@router.get("/sync/{run_id}")
def sync_status(run_id: int, current_user: str = Depends(require_income_access)):
    run = income_db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Загрузка не найдена")
    return run


@router.get("/runs")
def runs(current_user: str = Depends(require_income_access)):
    return {"runs": income_db.list_runs(), "loaded": income_db.loaded_periods()}


# ── Отчёт ────────────────────────────────────────────────────────────────────

@router.get("/report")
def report(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    with_trades: bool = False,
    current_user: str = Depends(require_income_access),
):
    rep, _, _ = _report(date_from, date_to)
    if not with_trades:
        rep["trades"] = []      # детализация большая — только по запросу / в Excel
    return rep


@router.get("/export")
def export(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    current_user: str = Depends(require_income_access),
):
    rep, rates, month = _report(date_from, date_to)
    content = income_excel.build_workbook(rep, rates, month.strftime("%m.%Y"))
    fname = f"income_{date_from.isoformat()}_{date_to.isoformat()}.xlsx"
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/diagnostics")
def diagnostics(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    current_user: str = Depends(require_income_access),
):
    """Для проверки логики на реальных данных: типы транзакций, сопоставление, инструменты, «тяжёлые» счета."""
    f, t = _period(date_from, date_to)
    data = income_db.load_period(f, t)
    settings = merge_settings(income_db.get_setting("rules"))
    rep = compute_report(data, settings, _rates_for_calc(_rates_month(date_to)))
    from services.income.rules import classify_instrument
    instruments = []
    for i in data["instruments"].values():
        instruments.append({
            "id": i["id"], "ticker": i.get("ticker"), "code": i.get("code"), "category": i.get("category"),
            "base": data["assets"].get(i.get("base_asset_id")), "quote": data["assets"].get(i.get("quote_asset_id")),
            "kind": classify_instrument(i, settings),
        })
    accounts = data["accounts"]
    heavy = []
    for r in income_db.trades_per_account(f, t)[:30]:
        a = accounts.get(r["account_id"]) or {}
        heavy.append({**r, "name": a.get("name"), "profile": a.get("client_profile_name"), "excluded": a.get("excluded")})
    return {
        "match_stats": rep["match_stats"],
        "counts": rep["counts"],
        "funding_rows": rep["funding_rows"],
        "transactions": income_db.transaction_summary(f, t),
        "instruments": sorted(instruments, key=lambda x: (x["kind"], x["ticker"] or "")),
        "heavy_accounts": heavy,
        "unmatched": [r for r in rep["trades"] if r["match"] == "none"][:200],
    }


# ── Счета ────────────────────────────────────────────────────────────────────

class AccountsUpdate(BaseModel):
    account_ids: list[int] = Field(..., min_length=1, max_length=5000)
    changes: dict


@router.get("/accounts")
def accounts(current_user: str = Depends(require_income_access)):
    return income_db.list_accounts()


@router.patch("/accounts")
def update_accounts(req: AccountsUpdate, current_user: str = Depends(require_income_access)):
    changes = dict(req.changes)
    if "role" in changes and changes["role"] not in (None, "", "client", "provider"):
        raise HTTPException(400, "Роль: client, provider или пусто (авто)")
    for k in ("role", "provider_label", "profile_label", "note"):
        if k in changes and isinstance(changes[k], str):
            changes[k] = changes[k].strip() or None
    if "excluded" in changes:
        changes["excluded"] = bool(changes["excluded"])
    n = income_db.update_accounts(req.account_ids, changes)
    return {"updated": n}


class AccountsAdd(BaseModel):
    account_ids: list[int] = Field(..., min_length=1, max_length=1000)


@router.post("/accounts")
def add_accounts(req: AccountsAdd, current_user: str = Depends(require_income_access)):
    """Добавить счета заранее (например, чтобы исключить до первой загрузки)."""
    income_db.ensure_accounts(req.account_ids)
    return {"ok": True}


# ── Курсы (на конец месяца, вводятся вручную) ────────────────────────────────

class RateRow(BaseModel):
    currency: str = Field(..., min_length=2, max_length=12)
    rate: float = Field(..., gt=0)
    mode: str = "USDCCY"


class RatesSave(BaseModel):
    month: date
    rates: list[RateRow]


@router.get("/rates")
def get_rates(
    month: date,
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    current_user: str = Depends(require_income_access),
):
    month = month.replace(day=1)
    saved = income_db.get_rates(month)
    prev_month, prev = income_db.latest_rates_before(month)
    needed = []
    if date_from and date_to:
        rep, _, _ = _report(date_from, date_to)
        needed = rep["missing_rates"]
    rows = [{**r, "currency": c, "pair": pair_label(c, r["mode"])} for c, r in saved.items()]
    for c in needed:
        if c not in saved:
            mode = default_rate_mode(c)
            rows.append({"currency": c, "rate": None, "mode": mode, "pair": pair_label(c, mode), "missing": True})
    return {
        "month": month.isoformat(),
        "rates": sorted(rows, key=lambda r: r["currency"]),
        "previous_month": prev_month.isoformat() if prev_month else None,
        "previous": [{"currency": c, "rate": r["rate"], "mode": r["mode"]} for c, r in prev.items()],
    }


@router.put("/rates")
def save_rates(req: RatesSave, current_user: str = Depends(require_income_access)):
    rows = []
    seen = set()
    for r in req.rates:
        c = r.currency.strip().upper()
        if c == "USD" or c in seen:
            continue
        if r.mode not in ("USDCCY", "CCYUSD"):
            raise HTTPException(400, f"Неверный тип котировки для {c}")
        seen.add(c)
        rows.append({"currency": c, "rate": r.rate, "mode": r.mode})
    income_db.save_rates(req.month.replace(day=1), rows, current_user)
    return {"saved": len(rows)}


# ── Настройки правил ─────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings(current_user: str = Depends(require_income_access)):
    return {"settings": merge_settings(income_db.get_setting("rules")), "defaults": DEFAULT_SETTINGS}


@router.put("/settings")
def save_settings(new: dict, current_user: str = Depends(require_income_access)):
    merged = merge_settings(new)
    for k in ("conversion_categories", "conversion_prefixes", "crypto_categories", "crypto_prefixes",
              "transaction_types"):
        if not isinstance(merged[k], list):
            raise HTTPException(400, f"{k}: нужен список")
        merged[k] = [str(x).strip() for x in merged[k] if str(x).strip()]
    for k, lo, hi in (("match_window_sec", 0, 3600), ("order_details_limit", 0, 20000), ("accounts_per_request", 1, 500)):
        try:
            merged[k] = max(lo, min(hi, float(merged[k]) if k == "match_window_sec" else int(merged[k])))
        except (TypeError, ValueError):
            raise HTTPException(400, f"{k}: нужно число")
    if merged["order_details_scope"] not in ("conversion", "all"):
        raise HTTPException(400, "order_details_scope: conversion или all")
    income_db.save_setting("rules", merged)
    return {"settings": merged}
