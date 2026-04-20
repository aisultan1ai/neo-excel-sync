from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel


class PodftTradeIn(BaseModel):
    account: str | None = None
    instrument: str | None = None
    side: str | None = None
    trading_dt: str | None = None
    deal_dt: str | None = None
    value_date: date
    qty: float | None = None
    amount_tg: float | None = None
    raw: dict[str, Any] | None = None


class PodftSnapshotCreate(BaseModel):
    snapshot_date: date
    trades: list[PodftTradeIn]