import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import get_current_user_record
from app.repositories.tasks import get_task_by_id
from app.repositories.task_attachments import (
    create_attachment,
    list_attachments,
    get_attachment_by_id,
    delete_attachment,
)
from app.utils.files import save_task_attachment, remove_physical_file

router = APIRouter(prefix="/api/v2/tasks", tags=["task-attachments"])


@router.get("/{task_id}/attachments")
def get_attachments(
    task_id: int,
    current_user=Depends(get_current_user_record),
):
    task = get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return list_attachments(task_id)


@router.post("/{task_id}/attachments")
def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user_record),
):
    task = get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    original_name, file_path = save_task_attachment(task_id, file)
    row = create_attachment(task_id, original_name, file_path)
    return {"status": "success", "attachment": row}


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: int,
    current_user=Depends(get_current_user_record),
):
    row = get_attachment_by_id(attachment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Physical file not found")

    return FileResponse(
        row["file_path"],
        filename=row["filename"],
    )


@router.delete("/attachments/{attachment_id}")
def remove_attachment(
    attachment_id: int,
    current_user=Depends(get_current_user_record),
):
    row = get_attachment_by_id(attachment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")

    remove_physical_file(row["file_path"])
    ok = delete_attachment(attachment_id)

    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete attachment")

    return {"status": "success"}