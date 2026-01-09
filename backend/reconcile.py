# reconcile.py
# NeoExcelSync: отдельный модуль для "Сверка Excel" (3 режима) с APIRouter
#
# ✅ Без добавления большого кода в main.py
# ✅ Без циклических импортов: зависимости (auth + file utils + logger) передаются снаружи
#
# Как подключить (в main.py всего 2 строки):
#   from reconcile import create_reconcile_router
#   app.include_router(create_reconcile_router(get_current_user, save_upload_file, cleanup_files, log))
#
# Эндпоинты:
#   POST /api/tools/reconcile/instrument-direction
#   POST /api/tools/reconcile/duplicates-single
#   POST /api/tools/reconcile/amount-paper-two-files
#   GET  /api/tools/reconcile/download/{token}

import os
import re
import uuid
from io import BytesIO
from datetime import datetime, timedelta
from threading import Lock
from typing import Any, Dict, Callable, Tuple, Optional

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool


# ---------------------------
# Cache (xlsx bytes by token)
# ---------------------------
RECONCILE_CACHE: Dict[str, Any] = {}
RECONCILE_LOCK = Lock()
RECONCILE_TTL_MINUTES = int(os.getenv("RECONCILE_TTL_MINUTES", "60"))
RECONCILE_MAX_ITEMS = int(os.getenv("RECONCILE_MAX_ITEMS", "40"))


def cleanup_reconcile_cache() -> None:
    now = datetime.now()
    ttl = timedelta(minutes=RECONCILE_TTL_MINUTES)

    with RECONCILE_LOCK:
        expired = [
            k for k, v in RECONCILE_CACHE.items()
            if (now - v.get("created_at", now)) > ttl
        ]
        for k in expired:
            RECONCILE_CACHE.pop(k, None)

        while len(RECONCILE_CACHE) > RECONCILE_MAX_ITEMS:
            oldest = min(RECONCILE_CACHE.keys(), key=lambda k: RECONCILE_CACHE[k]["created_at"])
            RECONCILE_CACHE.pop(oldest, None)


# ---------------------------
# Excel helpers
# ---------------------------
def to_excel_bytes_sheets(sheets: Dict[str, pd.DataFrame]) -> bytes:
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as w:
        for name, df in sheets.items():
            df.to_excel(w, index=False, sheet_name=str(name)[:31])
    return output.getvalue()


def _read_excel_path(path: str) -> pd.DataFrame:
    # читаем обычным образом: суммы будем парсить сами
    return pd.read_excel(path)


# ---------------------------
# Normalizers (из Streamlit)
# ---------------------------
def norm_from_file1(x: str) -> str:
    """
    Примеры:
    US91324P1021___UNH US  -> UNH
    US0032601066___PPLT    -> PPLT
    """
    if pd.isna(x):
        return ""
    s = str(x).strip()
    if "___" in s:
        s = s.split("___", 1)[1].strip()
    if s:
        s = s.split()[0]
    return re.sub(r"[^A-Z0-9\-]", "", s.upper())


def norm_from_file2(x: str) -> str:
    """
    Пример:
    [EQ]UNH.NYSE.TOM -> UNH
    """
    if pd.isna(x):
        return ""
    s = str(x).strip()
    s = re.sub(r"^\[[^\]]+\]", "", s).strip()
    s = s.split(".", 1)[0].strip()
    return re.sub(r"[^A-Z0-9\-]", "", s.upper())


def norm_op_file1(x: str) -> str:
    """
    Ожидаем:
    "Списание денежных средств" / "Зачисление денежных средств"
    """
    if pd.isna(x):
        return ""
    s = str(x).strip().lower()
    if "спис" in s:
        return "Списание денежных средств"
    if "зачис" in s:
        return "Зачисление денежных средств"
    return ""


def norm_side_file2(x: str) -> str:
    """
    Side: Buy/Sell
    Buy  -> Списание денежных средств
    Sell -> Зачисление денежных средств
    """
    if pd.isna(x):
        return ""
    s = str(x).strip().lower()
    if s == "buy":
        return "Списание денежных средств"
    if s == "sell":
        return "Зачисление денежных средств"
    return ""


def parse_amount(x) -> Optional[float]:
    if pd.isna(x):
        return None
    if isinstance(x, (int, float)):
        return float(x)

    s = str(x).strip()
    if not s:
        return None

    s = s.replace("\u00A0", " ").replace(" ", "")
    s = re.sub(r"[^0-9\-\.,]", "", s)
    if not s:
        return None

    if "," in s and "." in s:
        s = s.replace(",", "")
    else:
        s = s.replace(",", ".")

    try:
        return float(s)
    except Exception:
        return None


# ---------------------------
# Mode implementations (sync)
# ---------------------------
def _mode_instrument_direction_sync(
    f1_path: str, f2_path: str,
    col1: str, op1_col: str,
    col2: str, side2_col: str
) -> Tuple[pd.DataFrame, bytes]:
    df1 = _read_excel_path(f1_path)
    df2 = _read_excel_path(f2_path)

    missing_1 = [c for c in [col1, op1_col] if c not in df1.columns]
    missing_2 = [c for c in [col2, side2_col] if c not in df2.columns]
    if missing_1:
        raise ValueError(f"В файле 1 нет колонок: {missing_1}. Есть: {list(df1.columns)}")
    if missing_2:
        raise ValueError(f"В файле 2 нет колонок: {missing_2}. Есть: {list(df2.columns)}")

    t1 = df1[[col1, op1_col]].copy()
    t1["_inst"] = t1[col1].apply(norm_from_file1)
    t1["_dir"] = t1[op1_col].apply(norm_op_file1)

    t2 = df2[[col2, side2_col]].copy()
    t2["_inst"] = t2[col2].apply(norm_from_file2)
    t2["_dir"] = t2[side2_col].apply(norm_side_file2)

    base1 = t1[(t1["_inst"] != "") & (t1["_dir"] != "")]
    base2 = t2[(t2["_inst"] != "") & (t2["_dir"] != "")]

    c1 = base1.groupby(["_inst", "_dir"]).size().rename("count_file1")
    c2 = base2.groupby(["_inst", "_dir"]).size().rename("count_file2")

    summary = pd.concat([c1, c2], axis=1).fillna(0).astype(int).reset_index()
    summary = summary.rename(columns={"_inst": "InstrumentKey", "_dir": "Direction"})
    summary["diff_file1_minus_file2"] = summary["count_file1"] - summary["count_file2"]
    summary = summary.sort_values(by=["InstrumentKey", "Direction"], ascending=[True, True]).reset_index(drop=True)

    xlsx = to_excel_bytes_sheets({"Summary": summary})
    return summary, xlsx


def _mode_duplicates_single_sync(
    f1_path: str,
    paper_col: str,
    amount_col: str,
    min_repeats: int,
    round_to: int
) -> Tuple[pd.DataFrame, pd.DataFrame, bytes]:
    df = _read_excel_path(f1_path)

    if paper_col not in df.columns:
        raise ValueError(f"В файле нет колонки '{paper_col}'. Есть: {list(df.columns)}")
    if amount_col not in df.columns:
        raise ValueError(f"В файле нет колонки '{amount_col}'. Есть: {list(df.columns)}")

    t = df.copy()
    t["_paper_key"] = t[paper_col].apply(norm_from_file1)
    t["_amount"] = t[amount_col].apply(parse_amount)
    t["_amount_rounded"] = t["_amount"].apply(lambda v: round(v, int(round_to)) if v is not None else None)

    base = t[(t["_paper_key"] != "") & (t["_amount_rounded"].notna())].copy()

    freq = (
        base.groupby(["_paper_key", "_amount_rounded"])
            .size()
            .rename("count")
            .reset_index()
            .rename(columns={"_paper_key": "PaperKey", "_amount_rounded": "Amount"})
            .sort_values(["count", "PaperKey", "Amount"], ascending=[False, True, True])
            .reset_index(drop=True)
    )

    dup_pairs = freq[freq["count"] >= int(min_repeats)].copy().reset_index(drop=True)

    if dup_pairs.empty:
        xlsx = to_excel_bytes_sheets({"DuplicatesSummary": dup_pairs})
        return dup_pairs, pd.DataFrame(), xlsx

    dup_merge = dup_pairs[["PaperKey", "Amount"]].copy()
    export_rows = base.merge(
        dup_merge,
        left_on=["_paper_key", "_amount_rounded"],
        right_on=["PaperKey", "Amount"],
        how="inner"
    ).drop(columns=["_amount", "_amount_rounded"], errors="ignore")

    xlsx = to_excel_bytes_sheets({
        "DuplicatesSummary": dup_pairs,
        "DuplicatedRows": export_rows
    })
    return dup_pairs, export_rows, xlsx


def _mode_amount_paper_two_files_sync(
    f1_path: str, f2_path: str,
    paper1_col: str, amount1_col: str,
    paper2_col: str, amount2_col: str,
    round_to: int
) -> Tuple[pd.DataFrame, bytes]:
    df1 = _read_excel_path(f1_path)
    df2 = _read_excel_path(f2_path)

    missing_1 = [c for c in [paper1_col, amount1_col] if c not in df1.columns]
    missing_2 = [c for c in [paper2_col, amount2_col] if c not in df2.columns]
    if missing_1:
        raise ValueError(f"В файле 1 нет колонок: {missing_1}. Есть: {list(df1.columns)}")
    if missing_2:
        raise ValueError(f"В файле 2 нет колонок: {missing_2}. Есть: {list(df2.columns)}")

    t1 = df1[[paper1_col, amount1_col]].copy()
    t1["_paper"] = t1[paper1_col].apply(norm_from_file1)
    t1["_amt"] = t1[amount1_col].apply(parse_amount)
    t1["_amt_r"] = t1["_amt"].apply(lambda v: round(v, int(round_to)) if v is not None else None)
    base1 = t1[(t1["_paper"] != "") & (t1["_amt_r"].notna())]

    t2 = df2[[paper2_col, amount2_col]].copy()
    t2["_paper"] = t2[paper2_col].apply(norm_from_file2)
    t2["_amt"] = t2[amount2_col].apply(parse_amount)
    t2["_amt_r"] = t2["_amt"].apply(lambda v: round(v, int(round_to)) if v is not None else None)
    base2 = t2[(t2["_paper"] != "") & (t2["_amt_r"].notna())]

    c1 = base1.groupby(["_paper", "_amt_r"]).size().rename("count_file1")
    c2 = base2.groupby(["_paper", "_amt_r"]).size().rename("count_file2")

    summary = pd.concat([c1, c2], axis=1).fillna(0).astype(int).reset_index()
    summary = summary.rename(columns={"_paper": "PaperKey", "_amt_r": "Amount"})
    summary["diff_file1_minus_file2"] = summary["count_file1"] - summary["count_file2"]

    summary["abs_diff"] = summary["diff_file1_minus_file2"].abs()
    summary = summary.sort_values(by=["abs_diff", "PaperKey", "Amount"], ascending=[False, True, True]).reset_index(drop=True)
    summary = summary.drop(columns=["abs_diff"])

    xlsx = to_excel_bytes_sheets({"Summary": summary})
    return summary, xlsx


# ---------------------------
# Router factory (NO cycles)
# ---------------------------
def create_reconcile_router(
    get_current_user: Callable[..., Any],
    save_upload_file: Callable[[UploadFile], str],
    cleanup_files: Callable[..., Any],
    log: Any,
) -> APIRouter:
    """
    Создает роутер сверки, используя зависимости из main.py:
    - get_current_user (Depends)
    - save_upload_file (сохранение UploadFile -> путь)
    - cleanup_files (удаление временных файлов)
    - log (logger)
    """

    router = APIRouter(prefix="/api/tools/reconcile", tags=["tools-reconcile"])

    @router.post("/instrument-direction")
    async def reconcile_instrument_direction(
        file1: UploadFile = File(...),
        file2: UploadFile = File(...),
        col1: str = Form("Ценная бумага"),
        op1_col: str = Form("Тип операции ФИ"),
        col2: str = Form("Instrument"),
        side2_col: str = Form("Side"),
        current_user: str = Depends(get_current_user),
    ):
        f1_path = f2_path = None
        try:
            f1_path = save_upload_file(file1)
            f2_path = save_upload_file(file2)

            summary, xlsx = await run_in_threadpool(
                _mode_instrument_direction_sync,
                f1_path, f2_path, col1, op1_col, col2, side2_col
            )

            token = uuid.uuid4().hex
            with RECONCILE_LOCK:
                RECONCILE_CACHE[token] = {
                    "xlsx": xlsx,
                    "filename": "export_instrument_direction.xlsx",
                    "created_at": datetime.now(),
                }
            cleanup_reconcile_cache()

            return {
                "status": "success",
                "token": token,
                "columns": list(summary.columns),
                "summary": summary.fillna("").to_dict(orient="records"),
            }

        except Exception as e:
            log.error(f"reconcile instrument-direction error: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            cleanup_files(f1_path, f2_path)

    @router.post("/duplicates-single")
    async def reconcile_duplicates_single(
        file1: UploadFile = File(...),
        paper_col: str = Form("Ценная бумага"),
        amount_col: str = Form("Сумма в валюте"),
        min_repeats: int = Form(2),
        round_to: int = Form(2),
        current_user: str = Depends(get_current_user),
    ):
        f1_path = None
        try:
            if min_repeats < 2:
                raise HTTPException(status_code=400, detail="min_repeats должен быть >= 2")
            if round_to < 0 or round_to > 6:
                raise HTTPException(status_code=400, detail="round_to должен быть 0..6")

            f1_path = save_upload_file(file1)

            dup_pairs, export_rows, xlsx = await run_in_threadpool(
                _mode_duplicates_single_sync,
                f1_path, paper_col, amount_col, int(min_repeats), int(round_to)
            )

            token = uuid.uuid4().hex
            with RECONCILE_LOCK:
                RECONCILE_CACHE[token] = {
                    "xlsx": xlsx,
                    "filename": "duplicates_export.xlsx",
                    "created_at": datetime.now(),
                }
            cleanup_reconcile_cache()

            return {
                "status": "success",
                "token": token,
                "columns": list(dup_pairs.columns) if not dup_pairs.empty else ["PaperKey", "Amount", "count"],
                "summary": dup_pairs.fillna("").to_dict(orient="records"),
                "found": int(len(dup_pairs)),
            }

        except HTTPException:
            raise
        except Exception as e:
            log.error(f"reconcile duplicates-single error: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            cleanup_files(f1_path)

    @router.post("/amount-paper-two-files")
    async def reconcile_amount_paper_two_files(
        file1: UploadFile = File(...),
        file2: UploadFile = File(...),
        paper1_col: str = Form("Ценная бумага"),
        amount1_col: str = Form("Сумма в валюте"),
        paper2_col: str = Form("Instrument"),
        amount2_col: str = Form("Amount"),
        round_to: int = Form(2),
        current_user: str = Depends(get_current_user),
    ):
        f1_path = f2_path = None
        try:
            if round_to < 0 or round_to > 6:
                raise HTTPException(status_code=400, detail="round_to должен быть 0..6")

            f1_path = save_upload_file(file1)
            f2_path = save_upload_file(file2)

            summary, xlsx = await run_in_threadpool(
                _mode_amount_paper_two_files_sync,
                f1_path, f2_path, paper1_col, amount1_col, paper2_col, amount2_col, int(round_to)
            )

            token = uuid.uuid4().hex
            with RECONCILE_LOCK:
                RECONCILE_CACHE[token] = {
                    "xlsx": xlsx,
                    "filename": "export_amount_paper_two_files.xlsx",
                    "created_at": datetime.now(),
                }
            cleanup_reconcile_cache()

            return {
                "status": "success",
                "token": token,
                "columns": list(summary.columns),
                "summary": summary.fillna("").to_dict(orient="records"),
            }

        except HTTPException:
            raise
        except Exception as e:
            log.error(f"reconcile amount-paper-two-files error: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            cleanup_files(f1_path, f2_path)

    @router.get("/download/{token}")
    async def reconcile_download(
        token: str,
        current_user: str = Depends(get_current_user),
    ):
        cleanup_reconcile_cache()

        with RECONCILE_LOCK:
            item = RECONCILE_CACHE.get(token)

        if not item:
            raise HTTPException(status_code=404, detail="Файл не найден или истёк (TTL). Повторите сверку.")

        filename = item.get("filename", "export.xlsx")
        xlsx_bytes = item.get("xlsx")
        if not xlsx_bytes:
            raise HTTPException(status_code=500, detail="Пустой экспорт в кэше.")

        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return StreamingResponse(
            BytesIO(xlsx_bytes),
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    return router
