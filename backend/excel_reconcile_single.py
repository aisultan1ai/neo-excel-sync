# excel_reconcile_single.py
import re
from io import BytesIO
from typing import Dict, Optional

import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import StreamingResponse


# ------------------------------
# HELPERS
# ------------------------------
_RE_KEEP_ALNUM_DASH = re.compile(r"[^A-Z0-9\-]")
_RE_BRACKET_PREFIX = re.compile(r"^\[[^\]]+\]")


def norm_from_file1(x: object) -> str:
    if pd.isna(x):
        return ""
    s = str(x).strip()
    if "___" in s:
        s = s.split("___", 1)[1].strip()
    if s:
        s = s.split()[0]
    return _RE_KEEP_ALNUM_DASH.sub("", s.upper())


def norm_from_file2(x: object) -> str:
    if pd.isna(x):
        return ""
    s = str(x).strip()
    s = _RE_BRACKET_PREFIX.sub("", s).strip()
    s = s.split(".", 1)[0].strip()
    return _RE_KEEP_ALNUM_DASH.sub("", s.upper())


def norm_op_file1(x: object) -> str:
    if pd.isna(x):
        return ""
    s = str(x).strip().lower()
    if "спис" in s:
        return "Списание денежных средств"
    if "зачис" in s:
        return "Зачисление денежных средств"
    return ""


def norm_side_file2(x: object) -> str:
    if pd.isna(x):
        return ""
    s = str(x).strip().lower()
    if s == "buy":
        return "Списание денежных средств"
    if s == "sell":
        return "Зачисление денежных средств"
    return ""


def parse_amount(x: object) -> Optional[float]:
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


def to_excel_bytes_sheets(sheets: Dict[str, pd.DataFrame]) -> bytes:
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as w:
        for name, df in sheets.items():
            df.to_excel(w, index=False, sheet_name=name[:31])
    return output.getvalue()


async def read_table(upload_file: UploadFile) -> pd.DataFrame:
    raw = await upload_file.read()
    name = (upload_file.filename or "").lower()
    if name.endswith(".csv"):
        return pd.read_csv(BytesIO(raw))
    return pd.read_excel(BytesIO(raw))


def reconcile_two_files(df1, df2, col1, op1_col, col2, side2_col, target=None):
    missing_1 = [c for c in [col1, op1_col] if c not in df1.columns]
    missing_2 = [c for c in [col2, side2_col] if c not in df2.columns]
    if missing_1:
        raise ValueError(f"В файле 1 нет колонок: {missing_1}. Есть: {list(df1.columns)}")
    if missing_2:
        raise ValueError(f"В файле 2 нет колонок: {missing_2}. Есть: {list(df2.columns)}")

    df1 = df1.copy()
    df2 = df2.copy()

    df1["_inst"] = df1[col1].map(norm_from_file1)
    df1["_dir"] = df1[op1_col].map(norm_op_file1)

    df2["_inst"] = df2[col2].map(norm_from_file2)
    df2["_dir"] = df2[side2_col].map(norm_side_file2)

    base1 = df1[(df1["_inst"] != "") & (df1["_dir"] != "")]
    base2 = df2[(df2["_inst"] != "") & (df2["_dir"] != "")]

    c1 = base1.groupby(["_inst", "_dir"]).size().rename("count_file1")
    c2 = base2.groupby(["_inst", "_dir"]).size().rename("count_file2")

    summary = pd.concat([c1, c2], axis=1).fillna(0).astype(int).reset_index()
    summary = summary.rename(columns={"_inst": "InstrumentKey", "_dir": "Direction"})
    summary["diff_file1_minus_file2"] = summary["count_file1"] - summary["count_file2"]
    summary = summary.sort_values(by=["InstrumentKey", "Direction"], ascending=[True, True])

    target_df = pd.DataFrame()
    if target:
        t = target.strip().upper()
        target_df = summary[summary["InstrumentKey"] == t].copy()

    stats = {
        "rows_file1": int(len(df1)),
        "rows_file2": int(len(df2)),
        "matched_keys_file1": int(len(base1)),
        "matched_keys_file2": int(len(base2)),
        "unique_pairs": int(len(summary)),
    }
    return summary, target_df, stats


def find_duplicates_one_file(df, paper_col, amount_col, min_repeats=2, round_to=2, chosen_paper_key=None, chosen_amount=None):
    if paper_col not in df.columns:
        raise ValueError(f"В файле нет колонки '{paper_col}'. Есть: {list(df.columns)}")
    if amount_col not in df.columns:
        raise ValueError(f"В файле нет колонки '{amount_col}'. Есть: {list(df.columns)}")

    df = df.copy()
    df["_paper_key"] = df[paper_col].map(norm_from_file1)
    df["_amount"] = df[amount_col].map(parse_amount)
    df["_amount_rounded"] = df["_amount"].map(lambda v: round(v, int(round_to)) if v is not None else None)

    base = df[(df["_paper_key"] != "") & (df["_amount_rounded"].notna())].copy()

    freq = (
        base.groupby(["_paper_key", "_amount_rounded"])
        .size()
        .rename("count")
        .reset_index()
        .rename(columns={"_paper_key": "PaperKey", "_amount_rounded": "Amount"})
        .sort_values(["count", "PaperKey", "Amount"], ascending=[False, True, True])
    )

    dup_pairs = freq[freq["count"] >= int(min_repeats)].copy()

    chosen_rows = pd.DataFrame()
    if chosen_paper_key is not None and chosen_amount is not None:
        k = str(chosen_paper_key).strip().upper()
        a = float(chosen_amount)
        chosen_rows = base[(base["_paper_key"] == k) & (base["_amount_rounded"] == a)].copy()
        chosen_rows = chosen_rows.drop(columns=["_amount", "_amount_rounded"], errors="ignore")

    export_rows = pd.DataFrame()
    if not dup_pairs.empty:
        dup_merge = dup_pairs[["PaperKey", "Amount"]].copy()
        export_rows = base.merge(
            dup_merge,
            left_on=["_paper_key", "_amount_rounded"],
            right_on=["PaperKey", "Amount"],
            how="inner",
        )
        export_rows = export_rows.drop(columns=["_amount", "_amount_rounded"], errors="ignore")

    stats = {
        "rows_total": int(len(df)),
        "rows_parsed": int(len(base)),
        "dup_groups": int(len(dup_pairs)),
        "dup_rows": int(len(export_rows)) if not export_rows.empty else 0,
    }
    return dup_pairs, chosen_rows, export_rows, stats


# ------------------------------
# REGISTRATION (1 LINE IN MAIN)
# ------------------------------
def register_excel_reconcile(app: FastAPI) -> None:
    @app.post("/api/tools/excel-reconcile")
    async def excel_reconcile(
        mode: str = Query(..., regex="^(twofiles|duplicates)$"),
        export: int = Query(0, ge=0, le=1),

        file1: UploadFile = File(...),
        file2: Optional[UploadFile] = File(None),

        # twofiles
        col1: str = Form("Ценная бумага"),
        op1_col: str = Form("Тип операции ФИ"),
        col2: str = Form("Instrument"),
        side2_col: str = Form("Side"),
        target: str = Form(""),

        # duplicates
        paper_col: str = Form("Ценная бумага"),
        amount_col: str = Form("Сумма в валюте"),
        min_repeats: int = Form(2),
        round_to: int = Form(2),
        chosen_paper_key: str = Form(""),
        chosen_amount: str = Form(""),
    ):
        try:
            df1 = await read_table(file1)

            if mode == "twofiles":
                if file2 is None:
                    raise HTTPException(status_code=400, detail="Для режима twofiles нужен file2")
                df2 = await read_table(file2)

                summary, target_df, stats = reconcile_two_files(
                    df1=df1,
                    df2=df2,
                    col1=col1,
                    op1_col=op1_col,
                    col2=col2,
                    side2_col=side2_col,
                    target=target or None,
                )

                if export == 1:
                    xlsx = to_excel_bytes_sheets({"Summary": summary})
                    return StreamingResponse(
                        BytesIO(xlsx),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": 'attachment; filename="export.xlsx"'},
                    )

                return {
                    "status": "success",
                    "mode": "twofiles",
                    "stats": stats,
                    "summary": summary.to_dict(orient="records"),
                    "target_summary": target_df.to_dict(orient="records"),
                }

            dup_pairs, chosen_rows_df, export_rows_df, stats = find_duplicates_one_file(
                df=df1,
                paper_col=paper_col,
                amount_col=amount_col,
                min_repeats=min_repeats,
                round_to=round_to,
                chosen_paper_key=(chosen_paper_key or None),
                chosen_amount=(float(chosen_amount) if chosen_amount else None),
            )

            if export == 1:
                xlsx = to_excel_bytes_sheets({
                    "DuplicatesSummary": dup_pairs,
                    "DuplicatedRows": export_rows_df,
                })
                return StreamingResponse(
                    BytesIO(xlsx),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="duplicates_export.xlsx"'},
                )

            return {
                "status": "success",
                "mode": "duplicates",
                "stats": stats,
                "duplicates_summary": dup_pairs.to_dict(orient="records"),
                "chosen_rows": chosen_rows_df.to_dict(orient="records"),
            }

        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка обработки: {e}")
