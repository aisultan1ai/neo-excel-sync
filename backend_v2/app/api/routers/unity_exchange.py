import json
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from app.api.deps import get_current_user
from app.core.unity_exchange_cache import unity_exchange_cache
from app.services.unity_exchange.service import run_unity_exchange_job
from app.utils.files import save_temp_upload, remove_physical_file

router = APIRouter(prefix="/api/v2/unity-exchange", tags=["unity-exchange"])


@router.post("/run")
async def run_unity_exchange(
    unity_file: UploadFile = File(...),
    exchange_file: UploadFile = File(...),
    exchange_type: str = Form("BINANCE"),
    params_json: str = Form("{}"),
    preview_limit: int = Form(2000),
    current_user: str = Depends(get_current_user),
):
    unity_path = None
    exchange_path = None

    try:
        exchange_type = (exchange_type or "BINANCE").strip().upper()
        if exchange_type not in ("BINANCE", "OKX", "BYBIT"):
            raise HTTPException(
                status_code=400,
                detail="exchange_type must be BINANCE, OKX or BYBIT",
            )

        unity_path = save_temp_upload(unity_file, prefix="unity")
        exchange_path = save_temp_upload(exchange_file, prefix="exchange")

        try:
            params_dict = json.loads(params_json or "{}")
            if not isinstance(params_dict, dict):
                params_dict = {}
        except Exception:
            params_dict = {}

        result = await run_in_threadpool(
            run_unity_exchange_job,
            unity_path,
            exchange_path,
            exchange_type,
            params_dict,
            preview_limit,
        )

        run_id = unity_exchange_cache.store_run(
            owner=current_user,
            report_path=result["report_path"],
            payload=result,
        )

        return {
            "status": "success",
            "run_id": run_id,
            "exchange_name": result["exchange_name"],
            "report_filename": result["report_filename"],
            "summary": result["summary"],
            "preview": result["preview"],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        remove_physical_file(unity_path)
        remove_physical_file(exchange_path)


@router.get("/export/{run_id}")
async def export_unity_exchange_report(
    run_id: str,
    current_user: str = Depends(get_current_user),
):
    cached = unity_exchange_cache.get_run(run_id)

    if not cached:
        raise HTTPException(status_code=404, detail="Report expired or not found")

    if cached["owner"] != current_user:
        raise HTTPException(status_code=403, detail="Forbidden")

    report_path = cached["report_path"]
    if not report_path or not os.path.exists(report_path):
        raise HTTPException(status_code=404, detail="Report file not found")

    return FileResponse(
        report_path,
        filename=os.path.basename(report_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )