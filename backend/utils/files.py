import logging
import os
import shutil
import uuid

from fastapi import HTTPException, UploadFile

from core.config import TEMP_DIR

log = logging.getLogger(__name__)

os.makedirs(TEMP_DIR, exist_ok=True)


def save_upload_file(upload_file: UploadFile) -> str:
    try:
        safe_filename = os.path.basename(upload_file.filename).replace(" ", "_")
        unique_name = f"{uuid.uuid4().hex}_{safe_filename}"
        file_path = os.path.join(TEMP_DIR, unique_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        return file_path
    except Exception as e:
        log.error("Error saving file %s: %s", upload_file.filename, e)
        raise HTTPException(status_code=500, detail="Failed to save file")


def cleanup_files(*file_paths):
    for path in file_paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                log.warning("Failed to remove temp file %s: %s", path, e)
