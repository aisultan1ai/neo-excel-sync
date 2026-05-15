import logging
import os

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from core.deps import get_current_user
from utils.files import cleanup_files, save_upload_file

log = logging.getLogger(__name__)
router = APIRouter()


def _clean_instrument_name(raw_name: str) -> str:
    s = str(raw_name).strip()
    if "]" in s:
        s = s.split("]")[1]
    if "." in s:
        s = s.split(".")[0]
    if "::" in s:
        s = s.split("::")[0]
    return s.strip()


def _read_dataset(file_path: str) -> pd.DataFrame:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return pd.read_csv(file_path, sep=None, engine="python", dtype=str)
    return pd.read_excel(file_path, dtype=str)


def _parse_ticker_from_instrument(instr_str: str) -> str:
    s = str(instr_str)
    try:
        if "]" in s:
            s = s.split("]")[1]
        if "." in s:
            s = s.split(".")[0]
        return s.strip()
    except Exception:
        return s


def _format_report_number(num) -> str:
    try:
        return "{:,.2f}".format(float(num)).replace(",", " ")
    except Exception:
        return str(num)


@router.post("/api/v1/compare-instruments")
async def compare_instruments(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    col1: str = Form(...),
    col2: str = Form(...),
    current_user: str = Depends(get_current_user),
):
    f1_path = None
    f2_path = None
    try:
        allowed = (".xlsx", ".xls", ".csv")
        if not file1.filename or not file2.filename:
            raise HTTPException(status_code=400, detail="Files are required")
        if not file1.filename.lower().endswith(allowed):
            raise HTTPException(status_code=400, detail="file1: only .xlsx/.xls/.csv allowed")
        if not file2.filename.lower().endswith(allowed):
            raise HTTPException(status_code=400, detail="file2: only .xlsx/.xls/.csv allowed")

        f1_path = save_upload_file(file1)
        f2_path = save_upload_file(file2)
        res = await run_in_threadpool(_process_instruments, f1_path, f2_path, col1, col2)
        return res
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"compare-instruments failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Server error during instruments comparison")
    finally:
        cleanup_files(f1_path, f2_path)


@router.post("/api/v1/tools/generate-trade-report")
async def generate_trade_report(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    allowed = (".xlsx", ".xls", ".csv")
    if not file.filename or not file.filename.lower().endswith(allowed):
        raise HTTPException(400, "Only .xlsx/.xls/.csv allowed")
    temp_path = save_upload_file(file)
    try:
        df = pd.read_excel(temp_path)
        df.columns = [c.strip() for c in df.columns]

        required = ["Instrument", "Amount", "Quote amount"]
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise HTTPException(400, f"В файле не найдены колонки: {missing}")

        df["Ticker"] = df["Instrument"].apply(_parse_ticker_from_instrument)
        df["Type"] = df["Amount"].apply(lambda x: "лонг" if x > 0 else "шорт")

        report_lines = []
        for (ticker, trade_type), group in df.groupby(["Ticker", "Type"]):
            count_parts = len(group)
            amounts = group["Amount"].tolist()
            quotes = group["Quote amount"].tolist()
            amounts_str = " и ".join([str(x) for x in amounts])
            quotes_str = " и ".join([_format_report_number(x) for x in quotes])
            total_amount = sum(amounts)
            total_quote = sum(quotes)
            line = (
                f"{ticker} ({trade_type}) раздробился на {count_parts} частей "
                f"по количеству — {amounts_str} "
                f"по сумме ({quotes_str}) "
                f"в общем количестве — {total_amount}, "
                f"а по сумме выходит {_format_report_number(total_quote)}"
            )
            report_lines.append(line)

        return {"status": "success", "report": "\n".join(report_lines)}
    except Exception as e:
        log.error(f"Report generation error: {e}", exc_info=True)
        raise HTTPException(500, f"Ошибка обработки файла: {str(e)}")
    finally:
        cleanup_files(temp_path)


def _process_instruments(f1_path: str, f2_path: str, c1: str, c2: str):
    df1 = _read_dataset(f1_path)
    df2 = _read_dataset(f2_path)

    if c1 not in df1.columns:
        raise ValueError(f"Column '{c1}' missing in file 1")
    if c2 not in df2.columns:
        raise ValueError(f"Column '{c2}' missing in file 2")

    s1 = df1[c1].astype(str).map(_clean_instrument_name).astype(str).str.strip()
    s2 = df2[c2].astype(str).str.strip()
    s1 = s1[(s1.notna()) & (s1 != "")]
    s2 = s2[(s2.notna()) & (s2 != "")]

    c1_counts = s1.value_counts()
    c2_counts = s2.value_counts()
    set1 = set(c1_counts.index)
    set2 = set(c2_counts.index)

    common = sorted(set1 & set2)
    only_in_1 = sorted(set1 - set2)
    only_in_2 = sorted(set2 - set1)

    def row_for(key: str):
        n1 = int(c1_counts.get(key, 0))
        n2 = int(c2_counts.get(key, 0))
        return {"instrument": key, "count_file1": n1, "count_file2": n2, "diff": n1 - n2}

    matches_rows = sorted([row_for(k) for k in common], key=lambda r: abs(r["diff"]), reverse=True)
    only1_rows = [{"instrument": k, "count_file1": int(c1_counts.get(k, 0))} for k in only_in_1]
    only2_rows = [{"instrument": k, "count_file2": int(c2_counts.get(k, 0))} for k in only_in_2]

    return {
        "status": "success",
        "stats": {
            "unique_file1": len(set1), "unique_file2": len(set2),
            "matches": len(common), "only_in_1": len(only_in_1),
            "only_in_2": len(only_in_2), "rows_file1": int(len(s1)), "rows_file2": int(len(s2)),
        },
        "data": {
            "matches": matches_rows,
            "only_in_unity": only1_rows,
            "only_in_ais": only2_rows,
        },
    }
