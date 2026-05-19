import io
import logging

import openpyxl
import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.deps import get_current_user
from db import cashout as cashout_db
from db import balance_history as bh_db
from db import users as users_db
from services.encryption import decrypt_value

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/bh")

EXCEL_HEADERS = [
    "Счёт", "accountId", "Дата",
    "totalAssets", "cashBalance", "portfolioValue", "blocked", "blockedForOrders",
    "assetMarketValue", "cryptoBalance", "futureCashFlow", "unrealizedPnl",
    "accruedInterest", "totalUnrealizedPnl",
    "marginUtilization", "marginUsage", "marginBalance", "marginAvailable",
    "positionMargin", "cashMargin", "orderMargin",
    "cashIn", "cashOut", "cashAvailable", "externalTransfers",
    "dailyPnl", "dailyPnlPercent", "prevDayTotalAssets",
]


class BHAccountCreate(BaseModel):
    name: str
    account_id: str
    asset_id: str


def _unity_cfg(current_user: str) -> tuple[str, str]:
    user = users_db.get_user_by_username(current_user)
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    cfg = cashout_db.get_unity_config(user.id)
    base_url = (cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise HTTPException(400, "Unity API не настроен. Укажите Base URL в настройках.")
    token = decrypt_value(cfg["auth_token_enc"]) if cfg.get("auth_token_enc") else ""
    return base_url, token


def _fetch(base_url: str, token: str, account_id: str, asset_id: str, from_date: str, to_date: str) -> list:
    url = f"{base_url}/api/v1/balanceHistory"
    headers = {"auth-token": token} if token else {}
    params = {"accountId": account_id, "assetId": asset_id, "from": from_date, "to": to_date}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        log.warning("Unity balanceHistory error account=%s: %s", account_id, e)
        return []


# ── Счета ─────────────────────────────────────────────────────────────────────

@router.get("/accounts")
async def list_accounts(current_user: str = Depends(get_current_user)):
    return bh_db.list_bh_accounts()


@router.post("/accounts", status_code=201)
async def create_account(req: BHAccountCreate, current_user: str = Depends(get_current_user)):
    result = bh_db.create_bh_account(req.name, req.account_id, req.asset_id)
    if not result:
        raise HTTPException(500, "Ошибка создания счёта")
    return result


@router.delete("/accounts/{row_id}")
async def delete_account(row_id: int, current_user: str = Depends(get_current_user)):
    if not bh_db.delete_bh_account(row_id):
        raise HTTPException(500, "Ошибка удаления")
    return {"ok": True}


# ── Данные ────────────────────────────────────────────────────────────────────

@router.get("/data")
async def get_data(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    current_user: str = Depends(get_current_user),
):
    base_url, token = _unity_cfg(current_user)
    rows = []
    for acc in bh_db.list_bh_accounts():
        for entry in _fetch(base_url, token, acc["account_id"], acc["asset_id"], from_date, to_date):
            rows.append({"account_name": acc["name"], "account_id": acc["account_id"], **entry})
    return rows


@router.get("/export")
async def export_excel(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    current_user: str = Depends(get_current_user),
):
    base_url, token = _unity_cfg(current_user)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Остатки"
    ws.append(EXCEL_HEADERS)

    for acc in bh_db.list_bh_accounts():
        for entry in _fetch(base_url, token, acc["account_id"], acc["asset_id"], from_date, to_date):
            b = entry.get("balance", {})
            ws.append([
                acc["name"], acc["account_id"], entry.get("date"),
                b.get("totalAssets"), b.get("cashBalance"), b.get("portfolioValue"),
                b.get("blocked"), b.get("blockedForOrders"), b.get("assetMarketValue"),
                b.get("cryptoBalance"), b.get("futureCashFlow"), b.get("unrealizedPnl"),
                b.get("accruedInterest"), b.get("totalUnrealizedPnl"),
                b.get("marginUtilization"), b.get("marginUsage"), b.get("marginBalance"),
                b.get("marginAvailable"), b.get("positionMargin"), b.get("cashMargin"),
                b.get("orderMargin"), b.get("cashIn"), b.get("cashOut"),
                b.get("cashAvailable"), b.get("externalTransfers"),
                b.get("dailyPnl"), b.get("dailyPnlPercent"), b.get("prevDayTotalAssets"),
            ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"balances_{from_date}_{to_date}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
