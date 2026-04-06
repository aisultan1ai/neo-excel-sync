from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user_record
from app.repositories.tasks import (
    create_task,
    get_task_by_id,
    list_tasks_by_department,
    list_tasks_created_by_user,
    update_task_status,
)
from app.repositories.departments import list_departments
from app.schemas.tasks import TaskCreate, TaskStatusUpdate

router = APIRouter(prefix="/api/v2/tasks", tags=["tasks"])


@router.post("")
def create_new_task(
    payload: TaskCreate,
    current_user=Depends(get_current_user_record),
):
    title = payload.title.strip()
    description = payload.description.strip()
    to_department = payload.to_department.strip()
    priority = payload.priority.strip().lower()

    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    if priority not in ("normal", "urgent"):
        raise HTTPException(status_code=400, detail="priority must be normal or urgent")

    dept_names = {d["name"] for d in list_departments()}
    if to_department not in dept_names:
        raise HTTPException(status_code=400, detail="department not found")

    row = create_task(
        title=title,
        description=description,
        from_user_id=current_user["id"],
        to_department=to_department,
        to_user_id=payload.to_user_id,
        priority=priority,
        due_date=payload.due_date,
    )
    return {"status": "success", "task": row}


@router.get("/department/{department}")
def get_department_tasks(
    department: str,
    current_user=Depends(get_current_user_record),
):
    return list_tasks_by_department(department)


@router.get("/my")
def get_my_tasks(current_user=Depends(get_current_user_record)):
    return list_tasks_created_by_user(current_user["id"])


@router.get("/{task_id}")
def get_single_task(
    task_id: int,
    current_user=Depends(get_current_user_record),
):
    row = get_task_by_id(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


@router.put("/{task_id}/status")
def change_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    current_user=Depends(get_current_user_record),
):
    allowed = {"Open", "In Progress", "Done", "Cancelled"}
    if payload.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="status must be one of: Open, In Progress, Done, Cancelled",
        )

    row = update_task_status(task_id, payload.status)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"status": "success", "task": row}