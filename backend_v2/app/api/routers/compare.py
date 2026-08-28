import json
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.core.cache import compare_cache
from app.services.compare.orchestrator import run_compare
from app.services.compare.serializer import serialize_compare_results
from app.services.compare.export_service import export_results_to_stream
from app.utils.files import save_temp_upload, remove_physical_file

router = APIRouter(prefix="/api/v2/compare", tags=["compare"])


@router.post("")
async def compare_files(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    settings_json: str = Form(...),
    id_col_1: str = Form(...),
    acc_col_1: str = Form(...),
    id_col_2: str = Form(...),
    acc_col_2: str = Form(...),
    current_user: str = Depends(get_current_user),
):
    f1_path = None
    f2_path = None

    try:
        f1_path = save_temp_upload(file1, prefix="compare1")
        f2_path = save_temp_upload(file2, prefix="compare2")

        try:
            settings = json.loads(settings_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid settings_json")

        results = await run_in_threadpool(
            run_compare,
            f1_path,
            id_col_1,
            acc_col_1,
            f2_path,
            id_col_2,
            acc_col_2,
            settings,
            file1.filename or "File1.xlsx",
            file2.filename or "File2.xlsx",
        )

        comparison_id = compare_cache.store_results(current_user, results)
        return serialize_compare_results(results, comparison_id)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        remove_physical_file(f1_path)
        remove_physical_file(f2_path)


@router.get("/last-result")
def get_last_result(current_user: str = Depends(get_current_user)):
    cached = compare_cache.get_last_result(current_user)

    if not cached:
        return {"status": "empty", "message": "No data"}

    return serialize_compare_results(cached["data"], cached["comparison_id"])


@router.get("/export/{comparison_id}")
async def export_compare_result(
    comparison_id: str,
    current_user: str = Depends(get_current_user),
):
    cached = compare_cache.get_results(comparison_id)

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="Результаты устарели или не найдены. Повторите сверку.",
        )

    if cached["owner"] != current_user:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        stream = await run_in_threadpool(
            export_results_to_stream,
            cached["data"],
        )

        filename = f"Report_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

        return StreamingResponse(
            stream,
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации Excel: {e}")