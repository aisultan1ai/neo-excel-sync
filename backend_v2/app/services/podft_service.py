from __future__ import annotations

from datetime import date
from typing import Any

from app.repositories.podft import (
    create_podft_snapshot,
    add_podft_snapshot_trades,
    get_latest_podft_snapshot_for_date,
    get_podft_snapshot_count,
    get_podft_trades_by_snapshot,
)


def create_snapshot_with_trades(
    snapshot_date: date,
    created_by: str,
    trades: list[dict[str, Any]],
):
    snapshot = create_podft_snapshot(snapshot_date, created_by)
    inserted = add_podft_snapshot_trades(snapshot["id"], trades)
    total = get_podft_snapshot_count(snapshot["id"])

    return {
        "snapshot": snapshot,
        "inserted": inserted,
        "total": total,
    }


def get_latest_snapshot_for_date(snapshot_date: date):
    snapshot = get_latest_podft_snapshot_for_date(snapshot_date)
    if not snapshot:
        return None

    return {
        "snapshot": snapshot,
        "count": get_podft_snapshot_count(snapshot["id"]),
    }


def get_snapshot_trades(snapshot_id: int, limit: int = 500):
    return get_podft_trades_by_snapshot(snapshot_id, limit=limit)