from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.deps import get_current_user
from db.crypto import (
    get_crypto_accounts, create_crypto_account, update_crypto_account, delete_crypto_account,
    crypto_account_exists, get_crypto_transfers, create_crypto_transfer, delete_crypto_transfer,
    get_crypto_schemes, create_crypto_scheme, delete_crypto_scheme,
)

router = APIRouter()


class CryptoAccountCreate(BaseModel):
    provider: str
    name: str
    asset: Optional[str] = None


class CryptoAccountUpdate(BaseModel):
    provider: str
    name: str
    asset: Optional[str] = None


class CryptoTransferCreate(BaseModel):
    date: date
    type: str
    fromId: Optional[int] = None
    toId: Optional[int] = None
    amount: float
    asset: str
    comment: Optional[str] = ""
    label: Optional[str] = ""


class CryptoSchemeCreate(BaseModel):
    name: str
    nodes: object
    edges: object


@router.get("/api/v1/crypto/accounts")
def api_get_crypto_accounts(current_user: str = Depends(get_current_user)):
    return get_crypto_accounts()


@router.post("/api/v1/crypto/accounts")
def api_create_crypto_account(
    payload: CryptoAccountCreate, current_user: str = Depends(get_current_user)
):
    provider = (payload.provider or "").strip()
    name = (payload.name or "").strip()
    asset = (payload.asset or "").strip().upper() or None
    if not provider or not name:
        raise HTTPException(400, "provider and name required")
    row = create_crypto_account(provider, name, asset)
    if not row:
        raise HTTPException(500, "DB error creating crypto account")
    return {"status": "success", "account": dict(row)}


@router.put("/api/v1/crypto/accounts/{account_id}")
def api_update_crypto_account(
    account_id: int,
    payload: CryptoAccountUpdate,
    current_user: str = Depends(get_current_user),
):
    if not crypto_account_exists(account_id):
        raise HTTPException(404, "Account not found")
    provider = (payload.provider or "").strip()
    name = (payload.name or "").strip()
    asset = (payload.asset or "").strip().upper() or None
    if not provider or not name:
        raise HTTPException(400, "provider and name required")
    row = update_crypto_account(account_id, provider, name, asset)
    if not row:
        raise HTTPException(500, "DB error updating account")
    return row


@router.delete("/api/v1/crypto/accounts/{account_id}")
def api_delete_crypto_account(account_id: int, current_user: str = Depends(get_current_user)):
    if not delete_crypto_account(account_id):
        raise HTTPException(500, "DB error deleting account")
    return {"ok": True}


@router.get("/api/v1/crypto/transfers")
def api_get_crypto_transfers(current_user: str = Depends(get_current_user)):
    return get_crypto_transfers()


@router.post("/api/v1/crypto/transfers")
def api_create_crypto_transfer(
    payload: CryptoTransferCreate, current_user: str = Depends(get_current_user)
):
    t = (payload.type or "").strip().lower()
    if t not in ("transfer", "deposit", "withdraw"):
        raise HTTPException(400, "Invalid type")
    asset = (payload.asset or "").strip().upper()
    if not asset:
        raise HTTPException(400, "asset required")
    if t == "transfer":
        if not payload.fromId or not payload.toId:
            raise HTTPException(400, "fromId and toId required for transfer")
        if payload.fromId == payload.toId:
            raise HTTPException(400, "fromId and toId cannot be same")
    if t == "deposit" and not payload.toId:
        raise HTTPException(400, "toId required for deposit")
    if t == "withdraw" and not payload.fromId:
        raise HTTPException(400, "fromId required for withdraw")
    row = create_crypto_transfer(
        date=payload.date, type_=t, from_id=payload.fromId, to_id=payload.toId,
        amount=payload.amount, asset=asset,
        comment=(payload.comment or "").strip(), label=(payload.label or "").strip(),
    )
    if not row:
        raise HTTPException(500, "DB error creating transfer")
    return row


@router.delete("/api/v1/crypto/transfers/{transfer_id}")
def api_delete_crypto_transfer(transfer_id: int, current_user: str = Depends(get_current_user)):
    if not delete_crypto_transfer(transfer_id):
        raise HTTPException(404, "Transfer not found")
    return {"ok": True}


@router.get("/api/v1/crypto/schemes")
def api_get_crypto_schemes(current_user: str = Depends(get_current_user)):
    return get_crypto_schemes()


@router.post("/api/v1/crypto/schemes")
def api_create_crypto_scheme(
    payload: CryptoSchemeCreate, current_user: str = Depends(get_current_user)
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    row = create_crypto_scheme(name=name, nodes=payload.nodes, edges=payload.edges)
    if not row:
        raise HTTPException(500, "DB error creating scheme")
    return row


@router.delete("/api/v1/crypto/schemes/{scheme_id}")
def api_delete_crypto_scheme(scheme_id: int, current_user: str = Depends(get_current_user)):
    if not delete_crypto_scheme(scheme_id):
        raise HTTPException(500, "DB error deleting scheme")
    return {"ok": True}
