import os
import shutil
import time
from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.deps import get_current_user, require_admin, ensure_task_owner_or_admin
from db.tasks import (
    create_task, get_task_by_id, get_tasks_by_dept, get_user_tasks,
    update_task_content, update_task_status, delete_task,
    add_comment, get_comments,
    add_task_attachment, get_task_attachments, get_attachment_by_id, delete_task_attachment,
    accept_task,
)
from db.users import get_user_by_username, get_user_by_id
from db.problems import get_problems, get_problem_by_id, create_problem, update_problem, delete_problem
from db.podft import (
    create_podft_snapshot, add_podft_snapshot_trades,
    get_latest_podft_snapshot_for_date, get_podft_snapshot_count, get_podft_trades_by_snapshot,
)

router = APIRouter()


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    to_department: Optional[str] = None
    to_user_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: str = "normal"


class TaskStatusUpdate(BaseModel):
    status: str


class TaskUpdateContent(BaseModel):
    title: str
    description: str


class CommentCreate(BaseModel):
    content: str


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


# ── Tasks ──────────────────────────────────────────────────────

@router.get("/api/tasks/{department}")
async def read_tasks(department: str, current_user: str = Depends(get_current_user)):
    tasks = get_tasks_by_dept(department)
    return [dict(t) for t in tasks]


@router.post("/api/tasks")
async def create_new_task(
    task: TaskCreate, current_user: str = Depends(get_current_user)
):
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")

    pr = (task.priority or "normal").strip().lower()
    if pr not in ("normal", "urgent"):
        raise HTTPException(400, "priority must be normal or urgent")

    to_user_id = task.to_user_id
    to_department = (task.to_department or "").strip() or None

    if to_user_id:
        u = get_user_by_id(to_user_id)
        if not u:
            raise HTTPException(404, "Target user not found")
        if not to_department:
            to_department = u["department"]

    if not to_department:
        raise HTTPException(400, "to_department is required (or specify to_user_id)")

    task_id = create_task(
        task.title, task.description, user[0], to_department,
        to_user_id=to_user_id, due_date=task.due_date, priority=pr,
    )
    if task_id:
        return {"status": "success", "id": task_id}
    raise HTTPException(500, "Error creating task")


@router.post("/api/tasks/{task_id}/accept")
async def accept_task_endpoint(task_id: int, current_user: str = Depends(get_current_user)):
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")

    db_task = get_task_by_id(task_id)
    if not db_task:
        raise HTTPException(404, "Task not found")

    is_admin = user[4] if len(user) > 4 else False

    if db_task.get("to_user_id"):
        raise HTTPException(400, "This task is assigned to a specific user")
    if db_task.get("status") == "Done":
        raise HTTPException(400, "Cannot accept a completed task")
    if (not is_admin) and (db_task.get("to_department") != user[3]):
        raise HTTPException(403, "Not allowed")

    if db_task.get("accepted_by_user_id"):
        if db_task.get("accepted_by_user_id") == user[0]:
            return {"status": "success", "task": db_task}
        raise HTTPException(409, f"Already accepted by {db_task.get('accepted_by_name')}")

    updated = accept_task(task_id, user[0])
    if not updated:
        fresh = get_task_by_id(task_id)
        if fresh and fresh.get("accepted_by_user_id") == user[0]:
            return {"status": "success", "task": fresh}
        raise HTTPException(409, "Already accepted")

    fresh = get_task_by_id(task_id)
    return {"status": "success", "task": fresh or updated}


_VALID_STATUSES = {"Pending", "In Progress", "Done", "Rejected"}


@router.put("/api/tasks/{task_id}/status")
async def change_task_status(
    task_id: int,
    status_data: TaskStatusUpdate,
    current_user: str = Depends(get_current_user),
):
    if status_data.status not in _VALID_STATUSES:
        raise HTTPException(400, f"status must be one of: {', '.join(sorted(_VALID_STATUSES))}")
    if update_task_status(task_id, status_data.status):
        return {"status": "success"}
    raise HTTPException(500, "Error updating status")


@router.put("/api/tasks/{task_id}")
async def update_task_endpoint(
    task_id: int, task: TaskUpdateContent, current_user: str = Depends(get_current_user)
):
    user = get_user_by_username(current_user)
    db_task = get_task_by_id(task_id)
    if not db_task:
        raise HTTPException(404, "Task not found")
    ensure_task_owner_or_admin(db_task, user)
    if not update_task_content(task_id, task.title, task.description):
        raise HTTPException(500, "Failed to update task")
    return {"status": "success", "message": "Task updated"}


@router.delete("/api/tasks/{task_id}")
async def remove_task(task_id: int, current_user: str = Depends(get_current_user)):
    user = get_user_by_username(current_user)
    task = get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_owner_or_admin(task, user)
    if delete_task(task_id):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to delete task")


@router.get("/api/my-tasks")
async def read_my_tasks(current_user: str = Depends(get_current_user)):
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return [dict(t) for t in get_user_tasks(user[0])]


# ── Comments ───────────────────────────────────────────────────

@router.get("/api/tasks/{task_id}/comments")
async def read_comments(task_id: int, current_user: str = Depends(get_current_user)):
    return [dict(c) for c in get_comments(task_id)]


@router.post("/api/tasks/{task_id}/comments")
async def create_new_comment(
    task_id: int, comment: CommentCreate, current_user: str = Depends(get_current_user)
):
    user = get_user_by_username(current_user)
    if add_comment(task_id, user[0], comment.content):
        return {"status": "success"}
    raise HTTPException(500, "Error adding comment")


# ── Attachments ────────────────────────────────────────────────

@router.post("/api/tasks/{task_id}/attachments")
async def upload_task_attachment(
    task_id: int, file: UploadFile = File(...), current_user: str = Depends(get_current_user)
):
    base_dir = os.path.join(os.getcwd(), "task_files")
    os.makedirs(base_dir, exist_ok=True)
    safe_name = os.path.basename(file.filename)
    unique_name = f"{task_id}_{int(time.time())}_{safe_name}"
    file_path = os.path.join(base_dir, unique_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    if add_task_attachment(task_id, safe_name, file_path):
        return {"status": "success", "filename": safe_name}
    raise HTTPException(500, "Error saving attachment")


@router.get("/api/tasks/{task_id}/attachments")
async def get_task_files(task_id: int, current_user: str = Depends(get_current_user)):
    return get_task_attachments(task_id)


@router.get("/api/attachments/{attachment_id}")
async def download_attachment(attachment_id: int, current_user: str = Depends(get_current_user)):
    file_data = get_attachment_by_id(attachment_id)
    if not file_data or not os.path.exists(file_data["file_path"]):
        raise HTTPException(404, "File not found")
    return FileResponse(file_data["file_path"], filename=file_data["filename"])


@router.delete("/api/attachments/{attachment_id}")
async def remove_attachment(attachment_id: int, current_user: str = Depends(get_current_user)):
    user = get_user_by_username(current_user)
    file_data = get_attachment_by_id(attachment_id)
    if not file_data:
        raise HTTPException(404, "File not found")
    task = get_task_by_id(file_data["task_id"])
    if not task:
        raise HTTPException(404, "Task not found")
    ensure_task_owner_or_admin(task, user)
    if file_data and os.path.exists(file_data["file_path"]):
        os.remove(file_data["file_path"])
    if delete_task_attachment(attachment_id):
        return {"status": "success"}
    raise HTTPException(500, "Error deleting attachment")


# ── Problems ───────────────────────────────────────────────────

@router.get("/api/problems")
async def api_get_problems(limit: int = 50, current_user: str = Depends(get_current_user)):
    return [dict(r) for r in get_problems(limit=limit)]


@router.get("/api/problems/{problem_id}")
async def api_get_problem(problem_id: int, current_user: str = Depends(get_current_user)):
    row = get_problem_by_id(problem_id)
    if not row:
        raise HTTPException(404, "Problem not found")
    return dict(row)


@router.post("/api/problems")
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
        created_by_user_id=admin_user[0],
    )
    if not row:
        raise HTTPException(500, "DB error creating problem")
    return {"status": "success", "problem": dict(row)}


@router.put("/api/problems/{problem_id}")
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


@router.delete("/api/problems/{problem_id}")
async def api_delete_problem(problem_id: int, current_user: str = Depends(require_admin)):
    if not delete_problem(problem_id):
        raise HTTPException(404, "Problem not found")
    return {"status": "success"}


# ── PODFT ──────────────────────────────────────────────────────

@router.post("/api/podft/snapshots")
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


@router.get("/api/podft/today")
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


@router.get("/api/podft/trades")
async def podft_trades(
    day: date = Query(..., alias="date"), current_user: str = Depends(get_current_user)
):
    snap = get_latest_podft_snapshot_for_date(day)
    if not snap:
        return []
    return [dict(r) for r in get_podft_trades_by_snapshot(snap["id"], limit=500)]
