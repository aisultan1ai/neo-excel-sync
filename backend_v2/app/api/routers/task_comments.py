from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user_record
from app.repositories.tasks import get_task_by_id
from app.repositories.task_comments import list_comments, create_comment
from app.schemas.comments import CommentCreate

router = APIRouter(prefix="/api/v2/tasks", tags=["task-comments"])


@router.get("/{task_id}/comments")
def get_comments(
    task_id: int,
    current_user=Depends(get_current_user_record),
):
    task = get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return list_comments(task_id)


@router.post("/{task_id}/comments")
def add_comment(
    task_id: int,
    payload: CommentCreate,
    current_user=Depends(get_current_user_record),
):
    task = get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    row = create_comment(
        task_id=task_id,
        user_id=current_user["id"],
        content=content,
    )
    return {"status": "success", "comment": row}