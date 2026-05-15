import os
import shutil

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

import settings_manager
from core.deps import get_current_user
from core.limiter import limiter

router = APIRouter()

_ALLOWED_SPLIT_EXTENSIONS = {".xlsx", ".xls", ".csv"}
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@router.get("/api/v1/settings")
def get_settings(current_user: str = Depends(get_current_user)):
    return settings_manager.load_settings()


@router.post("/api/v1/settings")
def update_settings(
    new_settings: dict,
    current_user: str = Depends(get_current_user),
):
    return settings_manager.save_settings(new_settings)


@router.post("/api/v1/settings/upload-split-list")
@limiter.limit("20/minute")
async def upload_split_list_reference(
    request: Request,
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_SPLIT_EXTENSIONS:
        raise HTTPException(400, f"Only .xlsx/.xls/.csv allowed, got: {ext}")
    try:
        content = await file.read()
        if len(content) > _MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File too large (max 50 MB)")
        upload_dir = "data"
        os.makedirs(upload_dir, exist_ok=True)
        safe_name = os.path.basename(file.filename)
        file_path = os.path.join(upload_dir, safe_name)
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        current_settings = settings_manager.load_settings()
        current_settings["split_list_path"] = file_path
        settings_manager.save_settings(current_settings)
        return {"status": "success", "new_path": file_path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/settings/split-list-content")
def get_split_list_content(current_user: str = Depends(get_current_user)):
    try:
        s = settings_manager.load_settings()
        path = s.get("split_list_path")
        if not path or not os.path.exists(path):
            return {"status": "empty", "data": [], "message": "Файл не найден"}
        df = pd.read_excel(path).fillna("")
        return {
            "status": "success",
            "data": df.to_dict(orient="records"),
            "filename": os.path.basename(path),
        }
    except Exception as e:
        raise HTTPException(500, str(e))
