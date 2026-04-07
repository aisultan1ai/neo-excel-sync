from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel


class CryptoAccountCreate(BaseModel):
    provider: str
    name: str
    asset: str | None = None


class CryptoAccountUpdate(BaseModel):
    provider: str
    name: str
    asset: str | None = None


class CryptoTransferCreate(BaseModel):
    date: date
    type: str
    from_account_id: int | None = None
    to_account_id: int | None = None
    amount: float
    asset: str
    comment: str = ""
    label: str = ""


class CryptoSchemeCreate(BaseModel):
    name: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]