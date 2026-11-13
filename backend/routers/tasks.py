from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.deps import get_current_user, require_admin
from db.users import get_user_by_username
from db.problems import get_problems, get_problem_by_id, create_problem, update_problem, delete_problem
from db.podft import (
    create_podft_snapshot, add_podft_snapshot_trades,
    get_latest_podft_snapshot_for_date, get_podft_snapshot_count, get_podft_trades_by_snapshot,
)

router = APIRouter()


class ProblemCreate(BaseModel):
    title: str
    description: str = ""


class ProblemUpdate(BaseModel):
    title: str
    description: str = ""


class PodftTradeIn(BaseModel):
    account: Optional[str] = None
    instrument: Optional[str] = None
    side: Optional[str] = None
    trading_dt: Optional[str] = None
    deal_dt: Optional[str] = None
    value_date: date
    qty: Optional[float] = None
    amount_tg: Optional[float] = None
    raw: Optional[Dict[str, Any]] = None


class PodftSnapshotSaveIn(BaseModel):
    snapshot_date: date
    trades: list[PodftTradeIn]


# ── Problems ───────────────────────────────────────────────────

@router.get("/api/v1/problems")
async def api_get_problems(limit: int = 50, current_user: str = Depends(get_current_user)):
    return [dict(r) for r in get_problems(limit=limit)]


@router.get("/api/v1/problems/{problem_id}")
async def api_get_problem(problem_id: int, current_user: str = Depends(get_current_user)):
    row = get_problem_by_id(problem_id)
    if not row:
        raise HTTPException(404, "Problem not found")
    return dict(row)


@router.post("/api/v1/problems")
async def api_create_problem(payload: ProblemCreate, current_user: str = Depends(require_admin)):
    admin_user = get_user_by_username(current_user)
    if not admin_user:
        raise HTTPException(404, "User not found")
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(400, "title is required")
    row = create_problem(
        title=title,
        description=(payload.description or "").strip(),
        created_by_user_id=admin_user.id,
    )
    if not row:
        raise HTTPException(500, "DB error creating problem")
    return {"status": "success", "problem": dict(row)}


@router.put("/api/v1/problems/{problem_id}")
async def api_update_problem(
    problem_id: int, payload: ProblemUpdate, current_user: str = Depends(require_admin)
):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(400, "title is required")
    row = update_problem(
        problem_id=problem_id,
        title=title,
        description=(payload.description or "").strip(),
    )
    if not row:
        raise HTTPException(404, "Problem not found")
    return {"status": "success", "problem": dict(row)}


@router.delete("/api/v1/problems/{problem_id}")
async def api_delete_problem(problem_id: int, current_user: str = Depends(require_admin)):
    if not delete_problem(problem_id):
        raise HTTPException(404, "Problem not found")
    return {"status": "success"}


# ── PODFT ──────────────────────────────────────────────────────

@router.post("/api/v1/podft/snapshots")
async def save_podft_snapshot(
    payload: PodftSnapshotSaveIn, current_user: str = Depends(require_admin)
):
    if not payload.trades:
        raise HTTPException(400, "No trades to save")
    snap = create_podft_snapshot(payload.snapshot_date, created_by=current_user)
    if not snap:
        raise HTTPException(500, "Failed to create snapshot")
    trades_dicts = [t.model_dump() for t in payload.trades]
    inserted = add_podft_snapshot_trades(snap["id"], trades_dicts)
    return {
        "status": "success",
        "snapshot_id": snap["id"],
        "snapshot_date": str(payload.snapshot_date),
        "inserted": inserted,
        "created_at": str(snap.get("created_at")),
    }


@router.get("/api/v1/podft/today")
async def podft_today(
    day: Optional[date] = Query(None, alias="date"),
    current_user: str = Depends(get_current_user),
):
    target_day = day or date.today()
    snap = get_latest_podft_snapshot_for_date(target_day)
    if not snap:
        return {"date": str(target_day), "count": 0, "updated_at": None, "snapshot_id": None}
    count = get_podft_snapshot_count(snap["id"])
    return {
        "date": str(target_day),
        "count": count,
        "updated_at": str(snap.get("created_at")),
        "snapshot_id": snap["id"],
    }


@router.get("/api/v1/podft/trades")
async def podft_trades(
    day: date = Query(..., alias="date"), current_user: str = Depends(get_current_user)
):
    snap = get_latest_podft_snapshot_for_date(day)
    if not snap:
        return []
    return [dict(r) for r in get_podft_trades_by_snapshot(snap["id"], limit=500)]
