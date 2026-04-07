from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user_record
from app.schemas.crypto import (
    CryptoAccountCreate,
    CryptoAccountUpdate,
    CryptoTransferCreate,
    CryptoSchemeCreate,
)
from app.services.crypto_service import (
    list_accounts,
    add_account,
    edit_account,
    remove_account,
    list_transfers,
    add_transfer,
    remove_transfer,
    list_schemes,
    add_scheme,
    remove_scheme,
)

router = APIRouter(prefix="/api/v2/crypto", tags=["crypto"])


# -------------------------
# ACCOUNTS
# -------------------------
@router.get("/accounts")
def get_accounts(current_user=Depends(get_current_user_record)):
    return {"status": "success", "items": list_accounts()}


@router.post("/accounts")
def create_account(payload: CryptoAccountCreate, current_user=Depends(get_current_user_record)):
    row = add_account(
        provider=payload.provider.strip(),
        name=payload.name.strip(),
        asset=(payload.asset or "").strip() or None,
    )
    return {"status": "success", "item": row}


@router.put("/accounts/{account_id}")
def update_account(
    account_id: int,
    payload: CryptoAccountUpdate,
    current_user=Depends(get_current_user_record),
):
    row = edit_account(
        account_id=account_id,
        provider=payload.provider.strip(),
        name=payload.name.strip(),
        asset=(payload.asset or "").strip() or None,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"status": "success", "item": row}


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, current_user=Depends(get_current_user_record)):
    ok = remove_account(account_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"status": "success"}


# -------------------------
# TRANSFERS
# -------------------------
@router.get("/transfers")
def get_transfers(current_user=Depends(get_current_user_record)):
    return {"status": "success", "items": list_transfers()}


@router.post("/transfers")
def create_transfer(payload: CryptoTransferCreate, current_user=Depends(get_current_user_record)):
    try:
        row = add_transfer(
            date=payload.date,
            type_=payload.type,
            from_account_id=payload.from_account_id,
            to_account_id=payload.to_account_id,
            amount=payload.amount,
            asset=payload.asset.strip(),
            comment=payload.comment,
            label=payload.label,
        )
        return {"status": "success", "item": row}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/transfers/{transfer_id}")
def delete_transfer(transfer_id: int, current_user=Depends(get_current_user_record)):
    ok = remove_transfer(transfer_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return {"status": "success"}


# -------------------------
# SCHEMES
# -------------------------
@router.get("/schemes")
def get_schemes(current_user=Depends(get_current_user_record)):
    return {"status": "success", "items": list_schemes()}


@router.post("/schemes")
def create_scheme(payload: CryptoSchemeCreate, current_user=Depends(get_current_user_record)):
    row = add_scheme(
        name=payload.name.strip(),
        nodes=payload.nodes,
        edges=payload.edges,
    )
    return {"status": "success", "item": row}


@router.delete("/schemes/{scheme_id}")
def delete_scheme(scheme_id: int, current_user=Depends(get_current_user_record)):
    ok = remove_scheme(scheme_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return {"status": "success"}