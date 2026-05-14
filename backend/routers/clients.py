import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from fastapi.responses import FileResponse

from core.deps import get_current_user
from db.clients import (
    search_clients as db_search_clients,
    get_client_details as db_get_client_details,
    add_client,
    update_client,
    update_client_status,
    delete_client as db_delete_client,
    reset_all_clients_statuses,
)

log = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv", ".pdf", ".docx", ".doc", ".txt", ".png", ".jpg", ".jpeg"}


def _safe_file_path(folder_path: str, filename: str) -> Path:
    """Returns resolved path and raises 400 if it escapes the folder."""
    folder = Path(folder_path).resolve()
    safe_name = Path(filename).name
    dest = (folder / safe_name).resolve()
    if not str(dest).startswith(str(folder)):
        raise HTTPException(400, "Invalid filename")
    ext = dest.suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type not allowed: {ext}")
    return dest


@router.get("/api/clients")
def search_clients_endpoint(search: str = ""):
    raw = db_search_clients(search)
    return [{"id": c[0], "name": c[1], "status": c[2]} for c in raw]


@router.get("/api/clients/{client_id}")
def get_client_details_endpoint(client_id: int):
    details = db_get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    folder = details.get("folder_path")
    files = []
    if folder and Path(folder).exists():
        try:
            with Path(folder).open if False else None:
                pass
            for entry in Path(folder).iterdir():
                if entry.is_file():
                    files.append({"name": entry.name, "modified": entry.stat().st_mtime})
            files.sort(key=lambda x: x["name"])
        except Exception as e:
            log.error("Error listing files: %s", e)
    details["files"] = files
    return details


@router.post("/api/clients")
def add_new_client(
    name: str = Form(...),
    email: str = Form(""),
    account: str = Form(""),
    folder_path: str = Form(""),
):
    success, msg = add_client(name, email, account, folder_path_override=folder_path or None)
    if not success:
        raise HTTPException(400, msg)
    return {"status": "success", "message": msg}


@router.put("/api/clients/{client_id}")
def update_client_details(
    client_id: int,
    name: str = Form(...),
    email: str = Form(""),
    account: str = Form(""),
    folder_path: str = Form(""),
):
    success, msg = update_client(client_id, name, email, account, folder_path)
    if not success:
        raise HTTPException(400, msg)
    return {"status": "success"}


@router.put("/api/clients/{client_id}/status")
def update_status(client_id: int, status_data: dict):
    update_client_status(client_id, status_data.get("status"))
    return {"status": "success"}


@router.delete("/api/clients/{client_id}")
def delete_client(client_id: int):
    success, msg = db_delete_client(client_id)
    if not success:
        raise HTTPException(400, msg)
    return {"status": "success"}


@router.post("/api/clients/{client_id}/upload")
def upload_file_to_client(client_id: int, file: UploadFile = File(...)):
    details = db_get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    folder = details.get("folder_path")
    if not folder:
        raise HTTPException(400, "Client has no folder configured")
    Path(folder).mkdir(parents=True, exist_ok=True)
    dest = _safe_file_path(folder, file.filename)
    try:
        with open(dest, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/api/clients/{client_id}/files/{filename}")
def download_client_file(client_id: int, filename: str):
    details = db_get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    folder = details.get("folder_path")
    if not folder:
        raise HTTPException(404, "Client has no folder configured")
    path = _safe_file_path(folder, filename)
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(path), filename=path.name)


@router.delete("/api/clients/{client_id}/files/{filename}")
def delete_client_file(client_id: int, filename: str):
    details = db_get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    folder = details.get("folder_path")
    if not folder:
        raise HTTPException(404, "Client has no folder configured")
    path = _safe_file_path(folder, filename)
    if path.exists():
        path.unlink()
        return {"status": "success"}
    raise HTTPException(404, "File not found")


@router.post("/api/clients/reset-status")
async def reset_all_clients_status(current_user: str = Depends(get_current_user)):
    success = reset_all_clients_statuses()
    if success:
        return {"status": "success", "message": "Statuses reset"}
    raise HTTPException(500, "DB Error")
