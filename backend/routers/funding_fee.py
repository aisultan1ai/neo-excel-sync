import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.deps import get_current_user, ff_get_user, ff_check_account
from db import cashout as cashout_manager
from db import funding as funding_manager
from services import binance as binance_service
from services.encryption import encrypt_value, decrypt_value
from services.ff_export import build_funding_export, build_export_filename

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ff")


class FFAccountCreate(BaseModel):
    name: str
    api_key: str
    api_secret: str


class FFLoadRequest(BaseModel):
    account_id: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    symbol: Optional[str] = None


# ── Accounts ───────────────────────────────────────────────────

@router.get("/accounts")
async def ff_list_accounts(current_user: str = Depends(get_current_user)):
    ff_get_user(current_user)
    return funding_manager.get_ff_accounts_with_stats()


@router.post("/accounts", status_code=201)
async def ff_create_account(req: FFAccountCreate, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    try:
        api_key_enc = encrypt_value(req.api_key)
        api_secret_enc = encrypt_value(req.api_secret)
    except Exception as e:
        raise HTTPException(500, f"Encryption error: {e}")
    result = funding_manager.create_ff_account(user.id, req.name, api_key_enc, api_secret_enc)
    if not result:
        raise HTTPException(500, "Failed to create account")
    cashout_manager.log_ff_action(user.id, user.username, "account_add", {
        "account_name": req.name, "account_id": result["id"]
    })
    return result


@router.delete("/accounts/{account_id}")
async def ff_delete_account(account_id: int, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    account = ff_check_account(account_id, user, require_owner=True)
    funding_manager.delete_ff_account(account_id)
    cashout_manager.log_ff_action(user.id, user.username, "account_delete", {
        "account_name": account["name"], "account_id": account_id
    })
    return {"ok": True}


@router.get("/accounts/{account_id}/symbols")
async def ff_account_symbols(account_id: int, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    account = ff_check_account(account_id, user)
    try:
        symbols = binance_service.get_available_symbols(
            decrypt_value(account["api_key_enc"]),
            decrypt_value(account["api_secret_enc"]),
        )
    except Exception as e:
        raise HTTPException(400, f"Binance API error: {e}")
    return {"symbols": symbols}


# ── Records ────────────────────────────────────────────────────

@router.post("/load")
async def ff_load(req: FFLoadRequest, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    account = ff_check_account(req.account_id, user)
    try:
        records = binance_service.fetch_funding_records(
            api_key=decrypt_value(account["api_key_enc"]),
            api_secret=decrypt_value(account["api_secret_enc"]),
            symbol=req.symbol or None,
            start_date=req.start_date or None,
            end_date=req.end_date or None,
        )
    except Exception as e:
        raise HTTPException(400, f"Binance API error: {e}")
    new_saved = funding_manager.save_ff_records(req.account_id, records)
    return {"fetched": len(records), "new_saved": new_saved}


@router.post("/load-stream")
def ff_load_stream(req: FFLoadRequest, current_user: str = Depends(get_current_user)):
    user = ff_get_user(current_user)
    account = ff_check_account(req.account_id, user)
    api_key = decrypt_value(account["api_key_enc"])
    api_secret = decrypt_value(account["api_secret_enc"])
    account_id = req.account_id

    def _evt(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    def generate():
        yield _evt({"status": "connecting", "fetched": 0, "page": 0})
        all_records: list[dict] = []
        try:
            for page, total, batch in binance_service.fetch_funding_iter(
                api_key=api_key, api_secret=api_secret,
                symbol=req.symbol or None,
                start_date=req.start_date or None,
                end_date=req.end_date or None,
            ):
                all_records.extend(batch)
                yield _evt({"status": "loading", "fetched": total, "page": page})
        except Exception as e:
            yield _evt({"status": "error", "message": str(e)})
            return
        yield _evt({"status": "saving", "fetched": len(all_records)})
        new_count = funding_manager.save_ff_records(account_id, all_records)
        cashout_manager.log_ff_action(user.id, user.username, "records_load", {
            "account_id": account_id, "account_name": account["name"],
            "fetched": len(all_records), "new_saved": new_count,
            "start_date": req.start_date, "end_date": req.end_date, "symbol": req.symbol,
        })
        yield _evt({"status": "done", "fetched": len(all_records), "new_saved": new_count})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/records")
async def ff_get_records(
    account_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbol: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
    current_user: str = Depends(get_current_user),
):
    user = ff_get_user(current_user)

    if account_id:
        ff_check_account(account_id, user)
        allowed_ids = [account_id]
    else:
        accounts = funding_manager.get_ff_accounts(user.id, user.is_admin)
        allowed_ids = [a["id"] for a in accounts]

    if not allowed_ids:
        return []
    return funding_manager.get_ff_records(allowed_ids, start_date, end_date, symbol, limit, offset)


@router.get("/summary")
async def ff_get_summary(
    account_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbol: Optional[str] = None,
    current_user: str = Depends(get_current_user),
):
    user = ff_get_user(current_user)
    ff_check_account(account_id, user)
    return funding_manager.get_ff_summary(account_id, start_date, end_date, symbol)


@router.get("/export")
async def ff_export(
    account_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbol: Optional[str] = None,
    current_user: str = Depends(get_current_user),
):
    user = ff_get_user(current_user)
    account = ff_check_account(account_id, user)

    records = funding_manager.get_ff_records(
        [account_id], start_date, end_date, symbol, limit=100000, offset=0
    )
    buf = build_funding_export(account, records, start_date, end_date, symbol)
    filename = build_export_filename(account, start_date, end_date)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/records")
async def ff_delete_records(
    account_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbol: Optional[str] = None,
    current_user: str = Depends(get_current_user),
):
    user = ff_get_user(current_user)
    account = ff_check_account(account_id, user)
    count = funding_manager.delete_ff_records(account_id, start_date, end_date, symbol)
    cashout_manager.log_ff_action(user.id, user.username, "records_delete", {
        "account_id": account_id, "account_name": account["name"],
        "deleted": count, "start_date": start_date, "end_date": end_date, "symbol": symbol,
    })
    return {"deleted": count}
