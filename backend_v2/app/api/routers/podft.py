from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.schemas.podft import PodftSnapshotCreate
from app.services.podft_service import (
    create_snapshot_with_trades,
    get_latest_snapshot_for_date,
    get_snapshot_trades,
)

router = APIRouter(prefix="/api/v2/podft", tags=["podft"])


@router.post("/snapshots")
def create_podft_snapshot_api(
    payload: PodftSnapshotCreate,
    current_user: str = Depends(get_current_user),
):
    trades = [t.model_dump() for t in payload.trades]

    result = create_snapshot_with_trades(
        snapshot_date=payload.snapshot_date,
        created_by=current_user,
        trades=trades,
    )

    return {
        "status": "success",
        "snapshot_id": result["snapshot"]["id"],
        "snapshot_date": str(result["snapshot"]["snapshot_date"]),
        "created_at": result["snapshot"]["created_at"],
        "created_by": result["snapshot"]["created_by"],
        "inserted": result["inserted"],
        "count": result["total"],
    }


@router.get("/today")
def get_podft_today(
    snapshot_date: date | None = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    target_date = snapshot_date or date.today()
    result = get_latest_snapshot_for_date(target_date)

    if not result:
        return {
            "status": "empty",
            "snapshot_date": str(target_date),
            "message": "No snapshot found",
        }

    snapshot = result["snapshot"]
    return {
        "status": "success",
        "snapshot_id": snapshot["id"],
        "snapshot_date": str(snapshot["snapshot_date"]),
        "created_at": snapshot["created_at"],
        "created_by": snapshot["created_by"],
        "count": result["count"],
    }


@router.get("/trades")
def get_podft_trades(
    snapshot_id: int = Query(...),
    limit: int = Query(default=500, ge=1, le=5000),
    current_user: str = Depends(get_current_user),
):
    rows = get_snapshot_trades(snapshot_id=snapshot_id, limit=limit)

    if rows is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return {
        "status": "success",
        "snapshot_id": snapshot_id,
        "count": len(rows),
        "items": rows,
    }