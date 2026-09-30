import logging
from datetime import date

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.deps import get_current_user
from db import positions as positions_db
from routers.balance_history import _unity_cfg
from services import positions_recon, unity

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/positions")


class ReconcileRequest(BaseModel):
    account_ids: list[str] = Field(..., min_length=1, max_length=100)
    from_date: date | None = None   # None → дата открытия счёта, не раньше 2023-01-01
    to_date: date | None = None     # None → сегодня


class AccountsAdd(BaseModel):
    account_ids: list[str] = Field(..., min_length=1, max_length=100)


def _clean_ids(raw: list[str]) -> list[str]:
    ids = list(dict.fromkeys(a.strip() for a in raw if a and a.strip()))
    if not ids or not all(a.isdigit() for a in ids):
        raise HTTPException(400, "Некорректные ID счетов")
    return ids


def _unity_name(acc: dict | None) -> str | None:
    if not acc:
        return None
    full = " ".join(p for p in (acc.get("firstName"), acc.get("lastName")) if p)
    return acc.get("name") or full or acc.get("clientProfileName") or None


def _error_text(e: Exception) -> str:
    if isinstance(e, requests.HTTPError) and e.response is not None:
        return f"Unity API {e.response.status_code}: {e.response.text[:300]}"
    return str(e)


# ── Счета ─────────────────────────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(current_user: str = Depends(get_current_user)):
    return positions_db.list_accounts()


@router.post("/accounts", status_code=201)
def add_accounts(req: AccountsAdd, current_user: str = Depends(get_current_user)):
    ids = _clean_ids(req.account_ids)
    existing = {a["account_id"] for a in positions_db.list_accounts()}
    new_ids = [a for a in ids if a not in existing]
    if not new_ids:
        return {"added": [], "skipped": ids}

    unity_accounts: dict = {}
    try:
        base_url, token = _unity_cfg(current_user)
        unity_accounts = unity.get_accounts(base_url, token, new_ids)
    except Exception as e:
        # имя — не обязательно, счёт сохраняем и без него
        log.warning("Unity accounts при добавлении: %s", e)

    try:
        added = positions_db.add_accounts([(a, _unity_name(unity_accounts.get(a))) for a in new_ids])
    except Exception:
        raise HTTPException(500, "Ошибка сохранения счетов")
    return {"added": added, "skipped": [a for a in ids if a in existing]}


@router.delete("/accounts/{row_id}")
def delete_account(row_id: int, current_user: str = Depends(get_current_user)):
    if not positions_db.delete_account(row_id):
        raise HTTPException(500, "Ошибка удаления")
    return {"ok": True}


# ── Сверка ────────────────────────────────────────────────────────────────────

@router.post("/reconcile")
def reconcile(req: ReconcileRequest, current_user: str = Depends(get_current_user)):
    base_url, token = _unity_cfg(current_user)
    from_date = req.from_date.isoformat() if req.from_date else None
    to_date = (req.to_date or date.today()).isoformat()
    if from_date and from_date > to_date:
        raise HTTPException(400, "Дата «с» больше даты «по»")

    account_ids = _clean_ids(req.account_ids)
    names = {a["account_id"]: a["name"] for a in positions_db.list_accounts()}

    unity_accounts: dict = {}
    if not from_date:
        try:
            unity_accounts = unity.get_accounts(base_url, token, account_ids)
        except Exception as e:
            # без openDate просто начнём с HISTORY_FLOOR
            log.warning("Unity accounts: %s", e)

    # Unity лимитирует запросы на токен — счета обрабатываем последовательно
    accounts = []
    for acc_id in account_ids:
        acc = unity_accounts.get(acc_id)
        try:
            res = positions_recon.reconcile_account(base_url, token, acc_id, from_date, to_date, acc)
        except Exception as e:
            log.warning("Сверка позиций account=%s: %s", acc_id, e)
            res = {"account_id": acc_id, "error": _error_text(e), "rows": [], "summary": {}}
        res["account_name"] = names.get(acc_id) or _unity_name(acc)
        accounts.append(res)

    return {"from_date": from_date, "to_date": to_date, "accounts": accounts}
