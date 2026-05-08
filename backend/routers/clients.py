import os
import shutil
import logging

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from fastapi.responses import FileResponse

from core.deps import get_current_user
from db.clients import (
    search_clients, get_client_details, add_client, update_client,
    update_client_status, delete_client as db_delete_client, reset_all_clients_statuses,
)

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/clients")
def search_clients(search: str = ""):
    raw = search_clients(search)
    return [{"id": c[0], "name": c[1], "status": c[2]} for c in raw]


@router.get("/api/clients/{client_id}")
def get_client_details(client_id: int):
    details = get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    folder = details.get("folder_path")
    files = []
    if folder and os.path.exists(folder):
        try:
            with os.scandir(folder) as entries:
                for entry in entries:
                    if entry.is_file():
                        files.append({"name": entry.name, "modified": entry.stat().st_mtime})
            files.sort(key=lambda x: x["name"])
        except Exception as e:
            log.error(f"Error listing files: {e}")
    details["files"] = files
    return details


@router.post("/api/clients")
def add_new_client(
    name: str = Form(...),
    email: str = Form(""),
    account: str = Form(""),
    folder_path: str = Form(""),
):
    success, msg = add_client(name, email, account, folder_path_override=folder_path)
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
    details = get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    folder = details.get("folder_path")
    if not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True)
    safe_name = os.path.basename(file.filename)
    dest = os.path.join(folder, safe_name)
    try:
        with open(dest, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/api/clients/{client_id}/files/{filename}")
def download_client_file(client_id: int, filename: str):
    details = get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    safe_name = os.path.basename(filename)
    path = os.path.join(details.get("folder_path"), safe_name)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename=safe_name)


@router.delete("/api/clients/{client_id}/files/{filename}")
def delete_client_file(client_id: int, filename: str):
    details = get_client_details(client_id)
    if not details:
        raise HTTPException(404, "Client not found")
    safe_name = os.path.basename(filename)
    path = os.path.join(details.get("folder_path"), safe_name)
    if os.path.exists(path):
        os.remove(path)
        return {"status": "success"}
    raise HTTPException(404, "File not found")


@router.post("/api/clients/reset-status")
async def reset_all_clients_status(current_user: str = Depends(get_current_user)):
    try:
        success = reset_all_clients_statuses()
        if success:
            return {"status": "success", "message": "Statuses reset"}
        raise HTTPException(500, "DB Error")
    except Exception as e:
        raise HTTPException(500, str(e))
