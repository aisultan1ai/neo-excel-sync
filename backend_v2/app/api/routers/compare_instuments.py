import os

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.deps import get_current_user_record
from app.utils.files import save_temp_upload, remove_physical_file

router = APIRouter(prefix="/api/v2/compare-instruments", tags=["compare-instruments"])


def clean_instrument_name(raw_name):
    s = str(raw_name).strip()
    if "]" in s:
        s = s.split("]")[1]
    if "." in s:
        s = s.split(".")[0]
    if "::" in s:
        s = s.split("::")[0]
    return s.strip()


def read_dataset(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return pd.read_csv(file_path, sep=None, engine="python", dtype=str)
    return pd.read_excel(file_path, dtype=str)


def _process_instruments(f1_path: str, f2_path: str, c1: str, c2: str):
    df1 = read_dataset(f1_path)
    df2 = read_dataset(f2_path)

    if c1 not in df1.columns:
        raise ValueError(f"Column '{c1}' missing in file 1")
    if c2 not in df2.columns:
        raise ValueError(f"Column '{c2}' missing in file 2")

    s1 = df1[c1].astype(str).map(clean_instrument_name).astype(str).str.strip()
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
        return {
            "instrument": key,
            "count_file1": n1,
            "count_file2": n2,
            "diff": n1 - n2,
        }

    matches_rows = [row_for(k) for k in common]
    only1_rows = [{"instrument": k, "count_file1": int(c1_counts.get(k, 0))} for k in only_in_1]
    only2_rows = [{"instrument": k, "count_file2": int(c2_counts.get(k, 0))} for k in only_in_2]

    matches_rows.sort(key=lambda r: abs(r["diff"]), reverse=True)

    return {
        "status": "success",
        "stats": {
            "unique_file1": len(set1),
            "unique_file2": len(set2),
            "matches": len(common),
            "only_in_1": len(only_in_1),
            "only_in_2": len(only_in_2),
            "rows_file1": int(len(s1)),
            "rows_file2": int(len(s2)),
        },
        "data": {
            "matches": matches_rows,
            "only_in_unity": only1_rows,
            "only_in_ais": only2_rows,
        },
    }


@router.post("")
async def compare_instruments(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    col1: str = Form(...),
    col2: str = Form(...),
    current_user=Depends(get_current_user_record),
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

        f1_path = save_temp_upload(file1, prefix="instr1")
        f2_path = save_temp_upload(file2, prefix="instr2")

        return await run_in_threadpool(_process_instruments, f1_path, f2_path, col1, col2)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Server error during instruments comparison")
    finally:
        remove_physical_file(f1_path)
        remove_physical_file(f2_path)