import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

import split_processor
from core.deps import get_current_user
from core.limiter import limiter
from utils.files import cleanup_files, save_upload_file

router = APIRouter()

_ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024


@router.post("/api/v1/check-splits")
@limiter.limit("20/minute")
async def check_splits(
    request: Request,
    daily_file: UploadFile = File(...),
    settings_json: str = Form(...),
    current_user: str = Depends(get_current_user),
):
    ext = (daily_file.filename or "").rsplit(".", 1)[-1].lower()
    if f".{ext}" not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Only .xlsx/.xls/.csv allowed")
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cleanup_files(daily_path)
