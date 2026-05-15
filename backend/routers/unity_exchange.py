import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from core.constants import VALID_EXCHANGE_TYPES
from core.deps import get_current_user
from reconcile_core import ReconcileParams, reconcile_to_report
from utils.cache import CACHE_LOCK, LAST_UNITY_EXCHANGE_BY_USER, UNITY_EXCHANGE_CACHE, cleanup_unity_exchange_cache
from utils.files import cleanup_files, save_upload_file

log = logging.getLogger(__name__)
router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent
UNITY_EXCHANGE_REPORT_DIR = BASE_DIR / "client_reports" / "unity_exchange"
UNITY_EXCHANGE_REPORT_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/api/v1/unity-exchange/run")
async def run_unity_exchange(
    unity_file: UploadFile = File(...),
    exchange_file: UploadFile = File(...),
    exchange_type: str = Form("BINANCE"),
    params_json: str = Form("{}"),
    current_user: str = Depends(get_current_user),
):
    cleanup_unity_exchange_cache()
    unity_path = None
    ex_path = None
    try:
        exchange_type = (exchange_type or "BINANCE").strip().upper()
        if exchange_type not in VALID_EXCHANGE_TYPES:
            raise HTTPException(400, f"exchange_type must be one of: {', '.join(VALID_EXCHANGE_TYPES)}")

        unity_path = save_upload_file(unity_file)
        ex_path = save_upload_file(exchange_file)

        try:
            params_dict = json.loads(params_json or "{}")
            if not isinstance(params_dict, dict):
                params_dict = {}
        except Exception:
            params_dict = {}

        result = await run_in_threadpool(
            _process_unity_exchange_sync, unity_path, ex_path, exchange_type, params_dict
        )

        run_id = uuid.uuid4().hex
        with CACHE_LOCK:
            UNITY_EXCHANGE_CACHE[run_id] = {
                "created_at": datetime.now(),
                "owner": current_user,
                "report_path": result["report_path"],
                "exchange_name": result["exchange_name"],
            }
            LAST_UNITY_EXCHANGE_BY_USER[current_user] = run_id

        cleanup_unity_exchange_cache()

        return {
            "status": "success",
            "run_id": run_id,
            "exchange_name": result["exchange_name"],
            "report_filename": result["report_filename"],
            "summary": result["summary"],
            "preview": result.get("preview"),
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error("unity-exchange run error: %s", e, exc_info=True)
        raise HTTPException(500, detail=str(e))
    finally:
        cleanup_files(unity_path, ex_path)


@router.get("/api/v1/unity-exchange/export/{run_id}")
async def export_unity_exchange_report(
    run_id: str, current_user: str = Depends(get_current_user)
):
    cleanup_unity_exchange_cache()
    with CACHE_LOCK:
        cached = UNITY_EXCHANGE_CACHE.get(run_id)
    if not cached:
        raise HTTPException(404, "Report expired or not found")
    if cached.get("owner") != current_user:
        raise HTTPException(403, "Forbidden")
    report_path = cached.get("report_path")
    if not report_path or not os.path.exists(report_path):
        raise HTTPException(404, "Report file not found")
    return FileResponse(
        report_path,
        filename=os.path.basename(report_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _process_unity_exchange_sync(
    unity_path: str, exchange_path: str, exchange_type: str, params_dict: dict
):
    params = ReconcileParams(**(params_dict or {}))
    res = reconcile_to_report(
        unity_xlsx_path=Path(unity_path),
        exchange_path=Path(exchange_path),
        report_dir=UNITY_EXCHANGE_REPORT_DIR,
        exchange_type=exchange_type,
        params=params,
    )
    return {
        "report_path": str(res.report_path),
        "report_filename": os.path.basename(str(res.report_path)),
        "exchange_name": res.summary.exchange_name,
        "summary": res.summary.__dict__,
    }
