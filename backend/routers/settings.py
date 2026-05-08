import os
import shutil

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

import settings_manager

router = APIRouter()


@router.get("/api/settings")
def get_settings():
    return settings_manager.load_settings()


@router.post("/api/settings")
def update_settings(new_settings: dict):
    return settings_manager.save_settings(new_settings)


@router.post("/api/settings/upload-split-list")
async def upload_split_list_reference(file: UploadFile = File(...)):
    try:
        upload_dir = "data"
        os.makedirs(upload_dir, exist_ok=True)
        safe_name = os.path.basename(file.filename)
        file_path = os.path.join(upload_dir, safe_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        current_settings = settings_manager.load_settings()
        current_settings["split_list_path"] = file_path
        settings_manager.save_settings(current_settings)
        return {"status": "success", "new_path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/settings/split-list-content")
def get_split_list_content():
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
