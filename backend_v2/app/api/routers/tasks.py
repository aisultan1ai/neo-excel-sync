from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user_record
from app.repositories.tasks import (
    create_task,
    get_task_by_id,
    list_tasks_by_department,
    list_tasks_created_by_user,
    update_task_status,
    update_task_content,
    delete_task,
    accept_task,
)
from app.repositories.departments import list_departments
from app.repositories.users import get_user_by_id
from app.schemas.tasks import TaskCreate, TaskStatusUpdate

router = APIRouter(tags=["tasks"])


def ensure_task_owner_or_admin(task_row: dict, user_row: dict):
    if user_row["is_admin"]:
        return
    if task_row.get("from_user_id") != user_row["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")


@router.post("/api/v2/tasks")
def create_new_task(
    payload: TaskCreate,
    current_user=Depends(get_current_user_record),
):
    title = payload.title.strip()
    description = payload.description.strip()
    to_department = payload.to_department.strip() if payload.to_department else ""
    priority = payload.priority.strip().lower()

    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    if priority not in ("normal", "urgent"):
        raise HTTPException(status_code=400, detail="priority must be normal or urgent")

    to_user_id = payload.to_user_id
    if to_user_id:
        target_user = get_user_by_id(to_user_id)
        if not target_user:
            raise HTTPException(status_code=404, detail="Target user not found")
        if not to_department:
            to_department = target_user["department"]

    dept_names = {d["name"] for d in list_departments()}
    if not to_department or to_department not in dept_names:
        raise HTTPException(status_code=400, detail="department not found")

    row = create_task(
        title=title,
        description=description,
        from_user_id=current_user["id"],
        to_department=to_department,
        to_user_id=to_user_id,
        priority=priority,
        due_date=payload.due_date,
    )
    return {"status": "success", "task": row}


@router.get("/api/v2/tasks/department/{department}")
def get_department_tasks(
    department: str,
    current_user=Depends(get_current_user_record),
):
    return list_tasks_by_department(department)


@router.get("/api/v2/tasks/my")
def get_my_tasks(current_user=Depends(get_current_user_record)):
    return list_tasks_created_by_user(current_user["id"])


@router.get("/api/v2/my-tasks")
def get_my_tasks_alias(current_user=Depends(get_current_user_record)):
    return list_tasks_created_by_user(current_user["id"])


@router.get("/api/v2/tasks/{task_id}")
def get_single_task(
    task_id: int,
    current_user=Depends(get_current_user_record),
):
    row = get_task_by_id(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


@router.put("/api/v2/tasks/{task_id}/status")
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


@router.post("/api/v2/tasks/{task_id}/accept")
def accept_task_endpoint(
    task_id: int,
    current_user=Depends(get_current_user_record),
):
    db_task = get_task_by_id(task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    if db_task.get("to_user_id"):
        raise HTTPException(status_code=400, detail="This task is assigned to a specific user")

    if db_task.get("status") == "Done":
        raise HTTPException(status_code=400, detail="Cannot accept a completed task")

    if (not current_user["is_admin"]) and (db_task.get("to_department") != current_user["department"]):
        raise HTTPException(status_code=403, detail="Not allowed")

    if db_task.get("accepted_by_user_id"):
        if db_task.get("accepted_by_user_id") == current_user["id"]:
            return {"status": "success", "task": db_task}
        raise HTTPException(status_code=409, detail="Already accepted")

    updated = accept_task(task_id, current_user["id"])
    if not updated:
        fresh = get_task_by_id(task_id)
        if fresh and fresh.get("accepted_by_user_id") == current_user["id"]:
            return {"status": "success", "task": fresh}
        raise HTTPException(status_code=409, detail="Already accepted")

    fresh = get_task_by_id(task_id)
    return {"status": "success", "task": fresh or updated}


@router.put("/api/v2/tasks/{task_id}")
def update_task_endpoint(
    task_id: int,
    payload: dict,
    current_user=Depends(get_current_user_record),
):
    db_task = get_task_by_id(task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    ensure_task_owner_or_admin(db_task, current_user)

    title = str(payload.get("title", "")).strip()
    description = str(payload.get("description", "")).strip()

    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    row = update_task_content(task_id, title, description)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to update task")

    return {"status": "success", "task": row}


@router.delete("/api/v2/tasks/{task_id}")
def remove_task(
    task_id: int,
    current_user=Depends(get_current_user_record),
):
    db_task = get_task_by_id(task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    ensure_task_owner_or_admin(db_task, current_user)

    ok = delete_task(task_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete task")

    return {"status": "success"}