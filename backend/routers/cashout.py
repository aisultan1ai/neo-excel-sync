import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.constants import TransactionType, TriggeredBy, ScheduleFrequency
from core.deps import get_current_user, require_admin, ff_get_user, ff_check_account
from db import cashout as cashout_manager
from db import funding as funding_manager
from db.users import get_users_basic
from services import unity as cashout_service
from services.encryption import decrypt_value, encrypt_value

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ff")


class UnityConfigUpdate(BaseModel):
    base_url: str
    auth_token: Optional[str] = None


class CashoutMappingUpdate(BaseModel):
    unity_account_id: int
    unity_real_account_id: int
    unity_asset_id: int


class CashoutRequest(BaseModel):
    ff_account_id: int
    amount: float
    netting_date: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    comment: Optional[str] = None
    internal_comment: Optional[str] = None


class CashoutScheduleUpsert(BaseModel):
    ff_account_id: int
    frequency: ScheduleFrequency
    day_of_period: int
    enabled: bool = True


# ── Unity Config ───────────────────────────────────────────────

@router.get("/unity-config")
async def ff_get_unity_config(current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    cfg = cashout_manager.get_unity_config(user.id)
    return {"base_url": cfg["base_url"], "has_token": cfg["has_token"]}


@router.put("/unity-config")
async def ff_save_unity_config(
    req: UnityConfigUpdate, current_user: str = Depends(get_current_user)
):
    user = ff_get_user(current_user)
    cfg = cashout_manager.get_unity_config(user.id)
    if req.auth_token is None:
        token_enc = cfg.get("auth_token_enc", "")
    elif req.auth_token == "":
        token_enc = ""
    else:
        try:
            token_enc = encrypt_value(req.auth_token)
        except Exception as e:
            raise HTTPException(500, f"Encryption error: {e}")
    cashout_manager.save_unity_config(req.base_url, token_enc, user.id)
    cashout_manager.log_ff_action(user.id, user.username, "settings_update", {
        "base_url": req.base_url, "token_changed": req.auth_token is not None
    })
    return {"ok": True}


# ── Cashout Mappings ───────────────────────────────────────────

@router.get("/cashout-mappings")
async def ff_get_all_cashout_mappings(current_user: str = Depends(get_current_user)):
    ff_get_user(current_user)
    return cashout_manager.get_all_cashout_mappings()


@router.get("/cashout-mapping/{ff_account_id}")
async def ff_get_cashout_mapping(ff_account_id: int, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    ff_check_account(ff_account_id, user)
    return cashout_manager.get_cashout_mapping(ff_account_id) or {}


@router.put("/cashout-mapping/{ff_account_id}")
async def ff_save_cashout_mapping(
    ff_account_id: int,
    req: CashoutMappingUpdate,
    current_user: str = Depends(get_current_user),
):
    user = ff_get_user(current_user)
    account = ff_check_account(ff_account_id, user)
    cashout_manager.save_cashout_mapping(
        ff_account_id,
        req.unity_account_id,
        req.unity_real_account_id,
        req.unity_asset_id,
    )
    cashout_manager.log_ff_action(user.id, user.username, "mapping_update", {
        "account_id": ff_account_id, "account_name": account["name"],
        "unity_account_id": req.unity_account_id,
        "unity_real_account_id": req.unity_real_account_id,
        "unity_asset_id": req.unity_asset_id,
    })
    return {"ok": True}


# ── Manual Cash In / Cash Out ──────────────────────────────────

@router.post("/cashout", status_code=201)
async def ff_cashout(req: CashoutRequest, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    ff_check_account(req.ff_account_id, user)

    if req.amount == 0:
        raise HTTPException(400, "Amount must be non-zero")

    cfg = cashout_manager.get_unity_config(user.id)
    if not cfg.get("base_url"):
        raise HTTPException(400, "Unity API URL not configured")
    if not cfg.get("auth_token_enc"):
        raise HTTPException(400, "Unity API token not configured")

    mapping = cashout_manager.get_cashout_mapping(req.ff_account_id)
    if not mapping:
        raise HTTPException(400, "Unity account mapping not configured for this account")

    try:
        auth_token = decrypt_value(cfg["auth_token_enc"])
    except Exception as e:
        raise HTTPException(500, f"Token decryption error: {e}")

    is_cashin = req.amount > 0
    tx_type = TransactionType.CASHIN if is_cashin else TransactionType.CASHOUT
    abs_amount = round(abs(req.amount), 6)
    caller = cashout_service.send_cashin if is_cashin else cashout_service.send_cashout

    try:
        result = caller(
            base_url=cfg["base_url"],
            auth_token=auth_token,
            account_id=mapping["unity_account_id"],
            asset_id=mapping["unity_asset_id"],
            amount=abs_amount,
            netting_date=req.netting_date,
            real_account_id=mapping["unity_real_account_id"],
            comment=req.comment or "",
            internal_comment=req.internal_comment or "",
        )
        tx_id = str(result.get("transactionId", result) if isinstance(result, dict) else result)
        record = cashout_manager.save_cashout_record(
            ff_account_id=req.ff_account_id,
            amount=req.amount,
            netting_date=req.netting_date,
            start_date=req.start_date,
            end_date=req.end_date,
            transaction_id=tx_id,
            status="success",
            comment=req.comment,
            internal_comment=req.internal_comment,
            error_message=None,
            triggered_by=TriggeredBy.MANUAL.value,
            created_by_user_id=user.id,
            transaction_type=tx_type.value,
        )
        cashout_manager.log_ff_action(user.id, user.username, "cashout_send", {
            "account_id": req.ff_account_id, "tx_type": tx_type.value,
            "amount": req.amount, "tx_id": tx_id,
            "netting_date": req.netting_date,
            "start_date": req.start_date, "end_date": req.end_date,
            "comment": req.comment,
        })
        return {"ok": True, "transaction_id": tx_id, "transaction_type": tx_type.value, "record": record}
    except Exception as e:
        cashout_manager.save_cashout_record(
            ff_account_id=req.ff_account_id,
            amount=req.amount,
            netting_date=req.netting_date,
            start_date=req.start_date,
            end_date=req.end_date,
            transaction_id=None,
            status="error",
            comment=req.comment,
            internal_comment=req.internal_comment,
            error_message=str(e),
            triggered_by=TriggeredBy.MANUAL.value,
            created_by_user_id=user.id,
            transaction_type=tx_type.value,
        )
        raise HTTPException(400, f"Unity API error: {e}")


# ── History ────────────────────────────────────────────────────

@router.get("/cashout/history")
async def ff_cashout_history(
    ff_account_id: Optional[int] = None,
    limit: int = 200,
    current_user: str = Depends(get_current_user),
):
    user = ff_get_user(current_user)
    if ff_account_id:
        ff_check_account(ff_account_id, user)
    elif not user.is_admin:
        accounts = funding_manager.get_ff_accounts(user.id, False)
        if not [a["id"] for a in accounts]:
            return []
    return cashout_manager.get_cashout_history(ff_account_id, limit)


# ── Schedules ──────────────────────────────────────────────────

@router.get("/cashout/schedules")
async def ff_list_schedules(current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    if user.is_admin:
        return cashout_manager.get_cashout_schedules()
    accounts = funding_manager.get_ff_accounts(user.id, False)
    result = []
    for acc in accounts:
        result.extend(cashout_manager.get_cashout_schedules(acc["id"]))
    return result


@router.put("/cashout/schedules/{ff_account_id}")
async def ff_upsert_schedule(
    ff_account_id: int,
    req: CashoutScheduleUpsert,
    current_user: str = Depends(get_current_user),
):
    user = ff_get_user(current_user)
    ff_check_account(ff_account_id, user)
    if req.frequency == ScheduleFrequency.MONTHLY and not (1 <= req.day_of_period <= 28):
        raise HTTPException(400, "day_of_period for monthly must be 1-28")
    if req.frequency == ScheduleFrequency.WEEKLY and not (1 <= req.day_of_period <= 7):
        raise HTTPException(400, "day_of_period for weekly must be 1-7")
    result = cashout_manager.upsert_cashout_schedule(
        ff_account_id, req.frequency.value, req.day_of_period, req.enabled
    )
    account = ff_check_account(ff_account_id, user)
    cashout_manager.log_ff_action(user.id, user.username, "schedule_upsert", {
        "account_id": ff_account_id, "account_name": account["name"],
        "frequency": req.frequency.value, "day_of_period": req.day_of_period, "enabled": req.enabled,
    })
    return result or {"ok": True}


@router.delete("/cashout/schedules/{ff_account_id}")
async def ff_delete_schedule(ff_account_id: int, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    account = ff_check_account(ff_account_id, user)
    cashout_manager.delete_cashout_schedule_by_account(ff_account_id)
    cashout_manager.log_ff_action(user.id, user.username, "schedule_delete", {
        "account_id": ff_account_id, "account_name": account["name"]
    })
    return {"ok": True}


# ── Admin ──────────────────────────────────────────────────────

@router.get("/admin/backlog")
async def ff_admin_backlog(
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 500,
    current_user: str = Depends(require_admin),
):
    return cashout_manager.get_audit_log(limit, action, user_id, start_date, end_date)


@router.get("/admin/users")
async def ff_admin_users(current_user: str = Depends(require_admin)):
    return get_users_basic()
