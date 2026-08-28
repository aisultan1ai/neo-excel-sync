from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user_record, require_admin
from app.schemas.problems import ProblemCreate, ProblemUpdate
from app.services.problems_service import (
    list_problems,
    get_problem,
    add_problem,
    edit_problem,
    remove_problem,
)

router = APIRouter(prefix="/api/v2/problems", tags=["problems"])


@router.get("")
def api_get_problems(
    limit: int = Query(default=50, ge=1, le=500),
    current_user=Depends(get_current_user_record),
):
    rows = list_problems(limit=limit)
    return [dict(r) for r in rows]


@router.get("/{problem_id}")
def api_get_problem(
    problem_id: int,
    current_user=Depends(get_current_user_record),
):
    row = get_problem(problem_id)
    if not row:
        raise HTTPException(status_code=404, detail="Problem not found")
    return dict(row)


@router.post("")
def api_create_problem(
    payload: ProblemCreate,
    admin_user=Depends(require_admin),
):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    row = add_problem(
        title=title,
        description=(payload.description or "").strip(),
        created_by_user_id=admin_user["id"],
    )
    return {"status": "success", "problem": dict(row)}


@router.put("/{problem_id}")
def api_update_problem(
    problem_id: int,
    payload: ProblemUpdate,
    admin_user=Depends(require_admin),
):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    row = edit_problem(
        problem_id=problem_id,
        title=title,
        description=(payload.description or "").strip(),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Problem not found")

    return {"status": "success", "problem": dict(row)}


@router.delete("/{problem_id}")
def api_delete_problem(
    problem_id: int,
    admin_user=Depends(require_admin),
):
    ok = remove_problem(problem_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Problem not found")
    return {"status": "success"}