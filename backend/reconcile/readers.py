from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import pandas as pd


def _read_delimited_text(path: Path, delimiter: Optional[str]) -> pd.DataFrame:
    if delimiter:
        df = pd.read_csv(path, sep=delimiter, engine="python")
        if df.shape[1] > 1:
            return df
    for sep in [";", ",", "\t", "|"]:
        try:
            df = pd.read_csv(path, sep=sep, engine="python")
            if df.shape[1] > 1:
                return df
        except Exception:
            pass
    return pd.read_csv(path, engine="python")


def _read_binance_file(path: Path, delimiter: Optional[str]) -> pd.DataFrame:
    suf = path.suffix.lower()
    if suf in {".xlsx", ".xls"}:
        df = pd.read_excel(path)
        df.columns = [str(c).replace("﻿", "").strip() for c in df.columns]
        return df
    return _read_delimited_text(path, delimiter)


def _read_bybit_file(path: Path, delimiter: Optional[str] = None) -> pd.DataFrame:
    suf = path.suffix.lower()
    if suf in {".xlsx", ".xls"}:
        df = pd.read_excel(path)
        df.columns = [str(c).replace("﻿", "").strip() for c in df.columns]
        return df
    return _read_delimited_text(path, delimiter)


def _detect_okx_header_row(path: Path, max_rows: int = 25) -> int:
    try:
        raw = pd.read_excel(path, header=None, nrows=max_rows)
    except Exception:
        return 1

    def row_text(vals):
        return " | ".join([str(v) for v in vals if v is not None]).lower()

    for i in range(min(max_rows, len(raw))):
        s = row_text(raw.iloc[i].tolist())
        has_time = "time" in s
        has_symbol = ("symbol" in s) or ("instrument" in s) or ("inst" in s)
        has_action = ("action" in s) or ("side" in s) or ("direction" in s)
        if has_time and has_symbol and has_action:
            return i

    return 1


def _read_okx_xlsx(path: Path) -> Tuple[pd.DataFrame, Optional[int]]:
    tz_offset = None
    try:
        head = pd.read_excel(path, header=None, nrows=5)
        for v in head.values.flatten().tolist():
            if v is None:
                continue
            import re
            txt = str(v)
            m = re.search(r"UTC\s*([+-])\s*(\d{1,2})", txt, flags=re.IGNORECASE)
            if m:
                sign = 1 if m.group(1) == "+" else -1
                tz_offset = sign * int(m.group(2))
                break
    except Exception:
        tz_offset = None

    header_row = _detect_okx_header_row(path)
    df = pd.read_excel(path, header=header_row)
    df.columns = [str(c).replace("﻿", "").strip() for c in df.columns]
    return df, tz_offset
