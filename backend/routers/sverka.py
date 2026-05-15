import json
import logging
import re
import uuid
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

import excel_exporter
import processor
from utils.cache import CACHE_LOCK, COMPARISON_CACHE, LAST_RESULT_BY_USER, cleanup_cache
from core.deps import get_current_user
from utils.files import cleanup_files, save_upload_file

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/v1/compare")
async def run_comparison(
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
        original_name_1 = file1.filename
        original_name_2 = file2.filename
        f1_path = save_upload_file(file1)
        f2_path = save_upload_file(file2)
        settings = json.loads(settings_json)

        results = await run_in_threadpool(
            _process_comparison_sync,
            f1_path, id_col_1, acc_col_1,
            f2_path, id_col_2, acc_col_2,
            settings, original_name_1, original_name_2,
        )

        comparison_id = str(uuid.uuid4())
        with CACHE_LOCK:
            COMPARISON_CACHE[comparison_id] = {
                "data": results,
                "created_at": datetime.now(),
                "owner": current_user,
            }
            LAST_RESULT_BY_USER[current_user] = comparison_id

        cleanup_cache()

        json_response = {}
        for key, val in results.items():
            if isinstance(val, pd.DataFrame):
                json_response[key] = val.fillna("").to_dict(orient="records")
            elif isinstance(val, pd.Series):
                json_response[key] = val.to_dict()
            elif isinstance(val, (list, set)):
                json_response[key] = list(val)

        json_response["status"] = "success"
        json_response["comparison_id"] = comparison_id
        return json_response

    except Exception as e:
        log.error(f"Comparison error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_files(f1_path, f2_path)


@router.get("/api/v1/export/{comparison_id}")
async def export_excel_file(
    comparison_id: str, current_user: str = Depends(get_current_user)
):
    cleanup_cache()
    with CACHE_LOCK:
        cached = COMPARISON_CACHE.get(comparison_id)
    if not cached:
        raise HTTPException(
            status_code=404,
            detail="Результаты устарели или не найдены. Повторите сверку.",
        )
    if cached.get("owner") != current_user:
        raise HTTPException(403, "Forbidden")

    try:
        stream = await run_in_threadpool(excel_exporter.export_results_to_stream, cached["data"])
        filename = f"Report_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return StreamingResponse(
            stream,
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        log.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка генерации Excel")


@router.get("/api/v1/last-result")
def get_last_result(current_user: str = Depends(get_current_user)):
    cleanup_cache()
    with CACHE_LOCK:
        cid = LAST_RESULT_BY_USER.get(current_user)
        cached = COMPARISON_CACHE.get(cid) if cid else None

    if not cached:
        return {"status": "empty", "message": "No data"}

    results = cached["data"]
    json_response = {}
    for key, val in results.items():
        if isinstance(val, pd.DataFrame):
            json_response[key] = val.fillna("").to_dict(orient="records")
        elif isinstance(val, pd.Series):
            json_response[key] = val.to_dict()
        elif isinstance(val, set):
            json_response[key] = list(val)
        elif isinstance(val, list):
            json_response[key] = val

    json_response["status"] = "success"
    json_response["comparison_id"] = cid
    return json_response


def _process_comparison_sync(
    f1_path, id_col_1, acc_col_1, f2_path, id_col_2, acc_col_2, settings, name1, name2
):
    podft_settings = {
        "column": settings.get("podft_sum_col", "Сумма тг"),
        "threshold": settings.get("podft_threshold", "7000000"),
        "filter_enabled": settings.get("podft_filter_enabled", True),
        "filter_column": settings.get("podft_filter_col", "Рынок ЦБ"),
        "filter_values": settings.get("podft_filter_values", ""),
        "bo_enabled": settings.get("bo_enabled", True),
        "bo_unity_instrument_col": settings.get("bo_unity_instrument_col", "Instrument"),
        "bo_ais_sum_col": settings.get("bo_ais_sum_col", "Сумма тг"),
        "bo_threshold": settings.get("bo_threshold", "45000000"),
        "bo_prefixes": settings.get("bo_prefixes", "[BO],[OP]"),
    }
    overlap_accounts = settings.get("overlap_accounts", [])

    results, found_overlaps = processor.process_files(
        f1_path, id_col_1, acc_col_1,
        f2_path, id_col_2, acc_col_2,
        podft_settings, overlap_accounts,
        display_name1=name1, display_name2=name2,
    )

    if "podft_7m_deals" in results and not results["podft_7m_deals"].empty:
        df_7m = results["podft_7m_deals"]
        if "Рынок ЦБ" in df_7m.columns:
            results["podft_7m_deals"] = df_7m[df_7m["Рынок ЦБ"] != "MISX"]

    if "crypto_deals" in results and not results["crypto_deals"].empty:
        df_crypto = results["crypto_deals"].drop_duplicates()
        inst_cols = [
            c for c in df_crypto.columns
            if "инструмент" in c.lower() or "instrument" in c.lower()
        ]
        if inst_cols:
            df_crypto = df_crypto[
                ~df_crypto[inst_cols[0]].astype(str).str.startswith("FU")
            ]

        target_sum_col = "Сумма тг"
        sum_cols = [c for c in df_crypto.columns if "сумма" in c.lower() and "тг" in c.lower()]

        def clean_sum(df, col):
            temp_series = (
                df[col].astype(str)
                .str.replace(r"\s+", "", regex=True)
                .str.replace(",", ".")
            )
            return pd.to_numeric(temp_series, errors="coerce")

        if target_sum_col in df_crypto.columns:
            df_crypto = df_crypto[clean_sum(df_crypto, target_sum_col) >= 5000000]
        elif sum_cols:
            df_crypto = df_crypto[clean_sum(df_crypto, sum_cols[0]) >= 5000000]

        crypto_keywords = settings.get("crypto_keywords", "")
        crypto_col = settings.get("crypto_col", "")
        if settings.get("crypto_enabled", False) and crypto_keywords and crypto_col:
            if crypto_col in df_crypto.columns:
                keywords = [k.strip().upper() for k in crypto_keywords.split(",") if k.strip()]
                pattern = "|".join([re.escape(k) for k in keywords])
                df_crypto = df_crypto[
                    df_crypto[crypto_col].astype(str).str.upper().str.contains(pattern, regex=True, na=False)
                ]

        results["crypto_deals"] = df_crypto

    results["found_overlaps"] = found_overlaps
    return results
