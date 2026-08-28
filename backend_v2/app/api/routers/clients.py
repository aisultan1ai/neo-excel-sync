import os

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import get_current_user_record
from app.repositories.clients import (
    search_clients,
    get_client_by_id,
    create_client_with_folder,
    update_client,
    delete_client,
    reset_all_clients_statuses,
)
from app.schemas.clients import ClientCreate, ClientUpdate
from app.utils.files import (
    make_client_folder_name,
    ensure_client_folder,
    save_client_file,
    list_folder_files,
)

router = APIRouter(prefix="/api/v2/clients", tags=["clients"])


# ── Статические маршруты ВЫШЕ /{client_id}, иначе FastAPI
#    совпадает строку 'reset-status' с параметром client_id ──────────────────

@router.get("")
def get_clients(
    search: str = Query(default=""),
    current_user=Depends(get_current_user_record),
):
    return search_clients(search)


@router.post("/reset-status")
def reset_all_clients_status(current_user=Depends(get_current_user_record)):
    ok = reset_all_clients_statuses()
    if not ok:
        raise HTTPException(status_code=500, detail="DB Error")
    return {"status": "success", "message": "Statuses reset"}


@router.post("")
def create_new_client(
    payload: ClientCreate,
    current_user=Depends(get_current_user_record),
):
    name = payload.name.strip()
    email = payload.email.strip()
    account_number = payload.account_number.strip()

    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    # Создаём запись с placeholder, получаем id
    placeholder_row = create_client_with_folder(
        name=name,
        email=email,
        account_number=account_number,
        folder_path="__pending__",
    )
    client_id = placeholder_row["id"]

    folder_name = make_client_folder_name(name, client_id)
    folder_path = ensure_client_folder(folder_name)

    # Обновляем через репозиторий — без inline import в теле функции
    final_row = update_client(
        client_id=client_id,
        name=name,
        email=email,
        account_number=account_number,
        status=placeholder_row["status"],
        folder_path=folder_path,
    )

    return {"status": "success", "client": final_row}


# ── Параметрические маршруты /{client_id} ───────────────────────────────────

@router.get("/{client_id}")
def get_client_details(
    client_id: int,
    current_user=Depends(get_current_user_record),
):
    row = get_client_by_id(client_id)
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")

    data = dict(row)
    data["files"] = list_folder_files(row["folder_path"])
    return data


@router.put("/{client_id}")
def update_client_details(
    client_id: int,
    payload: ClientUpdate,
    current_user=Depends(get_current_user_record),
):
    existing = get_client_by_id(client_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")

    name = payload.name.strip()
    email = payload.email.strip()
    account_number = payload.account_number.strip()
    status = payload.status.strip()

    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    row = update_client(
        client_id=client_id,
        name=name,
        email=email,
        account_number=account_number,
        status=status,
    )
    return {"status": "success", "client": row}


@router.delete("/{client_id}")
def remove_client(
    client_id: int,
    current_user=Depends(get_current_user_record),
):
    existing = get_client_by_id(client_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")

    ok = delete_client(client_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete client")

    return {"status": "success"}


@router.get("/{client_id}/files")
def get_client_files(
    client_id: int,
    current_user=Depends(get_current_user_record),
):
    row = get_client_by_id(client_id)
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")

    return list_folder_files(row["folder_path"])


@router.post("/{client_id}/upload")
def upload_client_file(
    client_id: int,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user_record),
):
    row = get_client_by_id(client_id)
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")

    if not row["folder_path"]:
        raise HTTPException(status_code=400, detail="Client folder is not configured")

    filename, file_path = save_client_file(row["folder_path"], file)
    return {
        "status": "success",
        "filename": filename,
        "file_path": file_path,
    }


@router.get("/{client_id}/files/{filename}")
def download_client_file(
    client_id: int,
    filename: str,
    current_user=Depends(get_current_user_record),
):
    row = get_client_by_id(client_id)
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")

    safe_name = os.path.basename(filename)
    path = os.path.join(row["folder_path"], safe_name)

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path, filename=safe_name)


@router.delete("/{client_id}/files/{filename}")
def delete_client_file(
    client_id: int,
    filename: str,
    current_user=Depends(get_current_user_record),
):
    row = get_client_by_id(client_id)
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")

    safe_name = os.path.basename(filename)
    path = os.path.join(row["folder_path"], safe_name)

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")

    os.remove(path)
    return {"status": "success"}