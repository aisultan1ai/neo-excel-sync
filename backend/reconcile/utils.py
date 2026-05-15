from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, List, Optional, Tuple

import numpy as np
import pandas as pd


def _norm_col(s: Any) -> str:
    s2 = str(s).replace("﻿", "").strip()
    s2 = re.sub(r"\s+", " ", s2)
    return s2.lower()


def _pick_col(df: pd.DataFrame, candidates: List[str], required_name: str) -> str:
    norm_map = {_norm_col(c): c for c in df.columns}
    for cand in candidates:
        key = _norm_col(cand)
        if key in norm_map:
            return norm_map[key]
    raise ValueError(
        f"Не найдена колонка для '{required_name}'. "
        f"Искал: {candidates}. "
        f"В файле есть: {list(df.columns)}"
    )


def _pick_col_optional(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    norm_map = {_norm_col(c): c for c in df.columns}
    for cand in candidates:
        key = _norm_col(cand)
        if key in norm_map:
            return norm_map[key]
    return None


def _to_numeric_series(s: pd.Series) -> pd.Series:
    if s.dtype != object:
        return pd.to_numeric(s, errors="coerce")

    t = s.astype(str).str.replace(" ", "", regex=False).str.replace(" ", "", regex=False)

    has_dot = t.str.contains(r"\.", regex=True)
    has_comma = t.str.contains(",", regex=False)
    both = has_dot & has_comma

    t = t.where(~both, t.str.replace(",", "", regex=False))
    t = t.where(both, t.str.replace(",", ".", regex=False))

    return pd.to_numeric(t, errors="coerce")


def _qround_str(v: Any, decimals: int) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    d = Decimal(str(v))
    q = Decimal("1").scaleb(-decimals)
    return format(d.quantize(q, rounding=ROUND_HALF_UP), "f")


def _qround_float(v: Any, decimals: int) -> float:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return float("nan")
    d = Decimal(str(v))
    q = Decimal("1").scaleb(-decimals)
    return float(d.quantize(q, rounding=ROUND_HALF_UP))


def _detect_unity_offset_hours_from_text(s: Any, default_hours: int = 5) -> int:
    if s is None or (isinstance(s, float) and np.isnan(s)):
        return default_hours
    txt = str(s)
    m = re.search(r"\(UTC\s*([+-])\s*(\d{1,2})(?::(\d{2}))?\)", txt, flags=re.IGNORECASE)
    if not m:
        return default_hours

    sign = 1 if m.group(1) == "+" else -1
    hh = int(m.group(2))
    mm = int(m.group(3) or "0")
    if mm != 0:
        hh = hh + (1 if mm >= 30 else 0)
    return sign * hh


def _extract_symbol_from_unity(inst: Any) -> str:
    if inst is None or (isinstance(inst, float) and np.isnan(inst)):
        return ""
    s = str(inst).upper().strip()

    m = re.search(r"\](?P<sym>[A-Z0-9]+)\.", s)
    if m:
        return m.group("sym")
    m = re.search(r"\](?P<sym>[A-Z0-9]+)", s)
    if m:
        return m.group("sym")
    return s


def _extract_symbol_from_okx(sym: Any) -> str:
    if sym is None or (isinstance(sym, float) and np.isnan(sym)):
        return ""
    s = str(sym).upper().strip().replace(" ", "")
    parts = s.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}{parts[1]}"
    return re.sub(r"[^A-Z0-9]", "", s)


def _extract_symbol_basic(sym: Any) -> str:
    if sym is None or (isinstance(sym, float) and np.isnan(sym)):
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(sym).upper().strip())


def _snap_value(x: float, candidates: Tuple[float, ...], rel_tol: float = 0.05) -> Optional[float]:
    if not np.isfinite(x) or x <= 0:
        return None
    best = None
    best_err = None
    for c in candidates:
        err = abs(x - c) / c
        if best_err is None or err < best_err:
            best_err = err
            best = c
    if best is None:
        return None
    if best_err is not None and best_err <= rel_tol:
        return float(best)
    return float(x)


def _within_tol(bv: float, uv: float, rel: float, abs_tol: float) -> bool:
    if pd.isna(bv) or pd.isna(uv):
        return False
    diff = abs(float(uv) - float(bv))
    thresh = max(abs_tol, rel * abs(float(bv)))
    return diff <= thresh
