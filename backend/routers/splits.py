import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

import split_processor
from utils.files import cleanup_files, save_upload_file

router = APIRouter()


@router.post("/api/v1/check-splits")
async def check_splits(
    daily_file: UploadFile = File(...), settings_json: str = Form(...)
):
    daily_path = None
    try:
        daily_path = save_upload_file(daily_file)
        settings = json.loads(settings_json)
        success, result = await run_in_threadpool(split_processor.find_splits, daily_path, settings)
        if not success:
            return {"status": "error", "message": result}
        if result.empty:
            return {"status": "success", "data": [], "message": "No splits found"}
        return {
            "status": "success",
            "data": result.fillna("").to_dict(orient="records"),
            "message": f"Found {len(result)} splits",
        }
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cleanup_files(daily_path)
