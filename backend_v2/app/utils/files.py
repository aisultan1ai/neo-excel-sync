import os
import shutil
import time
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import settings


def ensure_storage_dirs():
    os.makedirs(settings.TASK_ATTACHMENTS_DIR, exist_ok=True)
    os.makedirs(settings.CLIENT_FILES_DIR, exist_ok=True)
    os.makedirs(settings.SETTINGS_DIR, exist_ok=True)
    os.makedirs(settings.SPLITS_DIR, exist_ok=True)
    os.makedirs(settings.TEMP_DIR, exist_ok=True)


def save_task_attachment(task_id: int, upload_file: UploadFile) -> tuple[str, str]:
    ensure_storage_dirs()

    safe_name = os.path.basename(upload_file.filename or "file.bin")
    unique_name = f"{task_id}_{int(time.time())}_{uuid4().hex}_{safe_name}"
    file_path = os.path.join(settings.TASK_ATTACHMENTS_DIR, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    return safe_name, file_path


def make_client_folder_name(client_name: str, client_id: int) -> str:
    cleaned = "".join(ch for ch in client_name if ch.isalnum() or ch in (" ", "_", "-"))
    cleaned = cleaned.strip().replace(" ", "_")
    if not cleaned:
        cleaned = "client"
    return f"{client_id}_{cleaned}"


def ensure_client_folder(folder_name: str) -> str:
    ensure_storage_dirs()
    folder_path = os.path.join(settings.CLIENT_FILES_DIR, folder_name)
    os.makedirs(folder_path, exist_ok=True)
    return folder_path


def save_client_file(folder_path: str, upload_file: UploadFile) -> tuple[str, str]:
    os.makedirs(folder_path, exist_ok=True)

    safe_name = os.path.basename(upload_file.filename or "file.bin")
    file_path = os.path.join(folder_path, safe_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    return safe_name, file_path


def save_split_reference_file(upload_file: UploadFile) -> tuple[str, str]:
    ensure_storage_dirs()

    safe_name = os.path.basename(upload_file.filename or "split_list.xlsx")
    file_path = os.path.join(settings.SPLITS_DIR, safe_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    return safe_name, file_path


def save_temp_upload(upload_file: UploadFile, prefix: str = "upload") -> str:
    ensure_storage_dirs()

    safe_name = os.path.basename(upload_file.filename or "file.bin")
    unique_name = f"{prefix}_{int(time.time())}_{uuid4().hex}_{safe_name}"
    file_path = os.path.join(settings.TEMP_DIR, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    return file_path


def list_folder_files(folder_path: str):
    if not folder_path or not os.path.exists(folder_path):
        return []

    items = []
    with os.scandir(folder_path) as entries:
        for entry in entries:
            if entry.is_file():
                items.append(
                    {
                        "name": entry.name,
                        "modified": entry.stat().st_mtime,
                        "size": entry.stat().st_size,
                    }
                )

    items.sort(key=lambda x: x["name"].lower())
    return items


def remove_physical_file(path: str | None):
    if path and os.path.exists(path):
        os.remove(path)