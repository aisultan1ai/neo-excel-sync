import json

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import get_current_user_record
from app.services.splits_service import (
    upload_split_reference,
    get_split_list_content,
    find_splits,
)
from app.utils.files import save_temp_upload, remove_physical_file

router = APIRouter(tags=["splits"])


@router.post("/api/v2/settings/upload-split-list")
def upload_split_list_reference(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user_record),
):
    return upload_split_reference(file)


@router.get("/api/v2/settings/split-list-content")
def get_split_reference_content(
    current_user=Depends(get_current_user_record),
):
    return get_split_list_content()


@router.post("/api/v2/check-splits")
def check_splits(
    daily_file: UploadFile = File(...),
    settings_json: str = Form("{}"),
    current_user=Depends(get_current_user_record),
):
    daily_path = None

    try:
        daily_path = save_temp_upload(daily_file, prefix="daily")

        try:
            extra_settings = json.loads(settings_json or "{}")
            if not isinstance(extra_settings, dict):
                extra_settings = {}
        except Exception:
            extra_settings = {}

        success, result = find_splits(daily_path, extra_settings)

        if not success:
            return {"status": "error", "message": result}

        if result.empty:
            return {"status": "success", "data": [], "message": "No splits found"}

        return {
            "status": "success",
            "data": result.fillna("").to_dict(orient="records"),
            "message": f"Found {len(result)} splits",
        }
    finally:
        remove_physical_file(daily_path)