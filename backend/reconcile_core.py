# reconcile_core.py
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Callable

import numpy as np
import pandas as pd

from openpyxl import load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo


# -----------------------------
# DTO / Config
# -----------------------------

@dataclass(frozen=True)
class ReconcileParams:
    # Unity transact time often contains "(UTC+5)"
    unity_utc_offset_hours: Optional[int] = 5  # None => auto-detect from text

    # OKX export often shows "Time Zone:UTC+5" in row0; if None => autodetect
    okx_utc_offset_hours: Optional[int] = None
    okx_filter_trade_actions: bool = True  # keep only Buy/Sell

    qty_decimals: int = 8
    price_decimals: int = 8

    enable_fuzzy: bool = True
    time_window_seconds: int = 180  # +- 3 min

    qty_rel_tol: float = 1e-6
    qty_abs_tol: float = 0.0

    price_rel_tol: float = 1e-6
    price_abs_tol: float = 0.0

    # Notional fallback (qty*price) for remaining rows
    enable_notional_fallback: bool = True
    notional_decimals: int = 6
    notional_use_minute_bucket: bool = True  # include minute_utc in key to reduce false matches

    # Volume reconciliation (by instrument)
    enable_volume_recon: bool = True
    volume_group_by_side: bool = True  # additional sheet by symbol+side

    # tolerances for volume compare
    volume_qty_rel_tol: float = 1e-9
    volume_qty_abs_tol: float = 0.0
    volume_notional_rel_tol: float = 1e-9
    volume_notional_abs_tol: float = 0.0

    # Binance delimiter: ';' usually
    binance_delimiter: Optional[str] = ";"  # None => auto

    # Export
    export_debug_sheets: bool = False  # True => add TopDiffs + RAW sheets
    export_mode: str = "compact"  # "compact" | "full"


@dataclass(frozen=True)
class ReconcileSummary:
    exchange_name: str
    rows_exchange: int
    rows_unity: int

    matched_strict: int
    matched_fuzzy: int
    matched_notional: int

    missing_in_unity: int
    extra_in_unity: int

    # volume stats (symbol-level)
    volume_symbols_exchange: int
    volume_symbols_unity: int
    volume_symbols_ok: int
    volume_symbols_diff: int
    volume_symbols_only_exchange: int
    volume_symbols_only_unity: int
    volume_total_qty_exchange: float
    volume_total_qty_unity: float
    volume_total_notional_exchange: float
    volume_total_notional_unity: float

    exchange_time_range_utc: str
    unity_time_range_utc: str
    warning: str = ""


@dataclass(frozen=True)
class ReconcileResult:
    report_id: str
    report_path: Path
    summary: ReconcileSummary


# -----------------------------
# Helpers (text/columns)
# -----------------------------

def _norm_col(s: str) -> str:
    s = str(s).replace("\ufeff", "").strip()
    s = re.sub(r"\s+", " ", s)
    return s.lower()


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
    """
    Unity Instrument example:
      "[FU]XRPUSDT.Dec2099 :: BINA" -> XRPUSDT
      "[CFD]BTCUSDT.TOD :: OKXE"    -> BTCUSDT
    """
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
    """
    OKX symbol examples:
      BTC-USDT-SWAP -> BTCUSDT
      ETH-USDT      -> ETHUSDT
    """
    if sym is None or (isinstance(sym, float) and np.isnan(sym)):
        return ""
    s = str(sym).upper().strip().replace(" ", "")
    parts = s.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}{parts[1]}"
    return re.sub(r"[^A-Z0-9]", "", s)


def _parse_unity_transact_time(raw: Any) -> pd.Timestamp:
    """
    Unity time looks like: "08.12.2025 10:00:13.123 (UTC+5)"
    """
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return pd.NaT
    txt = str(raw)
    txt = re.sub(r"\s*\(UTC[^\)]*\)\s*", "", txt).strip()
    return pd.to_datetime(txt, dayfirst=True, errors="coerce")


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


# -----------------------------
# Readers
# -----------------------------

def _read_binance_csv(path: Path, delimiter: Optional[str]) -> pd.DataFrame:
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


def _detect_okx_header_row(path: Path, max_rows: int = 20) -> int:
    """
    OKX Excel иногда имеет метаданные в первых строках.
    Ищем строку, где встречаются ключевые колонки (Time + Symbol/Instrument + Action/Side).
    Возвращаем индекс строки (0-based) для header=...
    """
    try:
        raw = pd.read_excel(path, header=None, nrows=max_rows)
    except Exception:
        return 1

    def row_has(tokens: List[str], row_values: List[Any]) -> bool:
        s = " | ".join([str(v) for v in row_values if v is not None]).lower()
        return all(t.lower() in s for t in tokens)

    for i in range(min(max_rows, len(raw))):
        vals = raw.iloc[i].tolist()
        # базовые сигналы
        has_time = row_has(["time"], vals)
        has_symbol = row_has(["symbol"], vals) or row_has(["instrument"], vals) or row_has(["inst"], vals)
        has_action = row_has(["action"], vals) or row_has(["side"], vals) or row_has(["direction"], vals)
        if has_time and has_symbol and has_action:
            return i

    return 1


def _read_okx_xlsx(path: Path) -> Tuple[pd.DataFrame, Optional[int]]:
    """
    OKX excel often:
      Row0: UID... / Account Type... / Time Zone:UTC+5
      Далее: строка с заголовками может быть не строго на 1
    """
    tz_offset = None
    try:
        head = pd.read_excel(path, header=None, nrows=3)
        for v in head.values.flatten().tolist():
            if v is None:
                continue
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
    df.columns = [str(c).replace("\ufeff", "").strip() for c in df.columns]
    return df, tz_offset


# -----------------------------
# Exchange standardizers
# -----------------------------

def _prepare_okx_to_standard(df: pd.DataFrame) -> pd.DataFrame:
    """
    Приводит OKX Excel к стандарту:
      Symbol, Side, Quantity, Price, Insert Time, Trade ID?, Order ID?, Fee?, Commission Asset?
    Делает это "умно" по разным названиям колонок.
    """
    out = df.copy()
    out.columns = [str(c).replace("\ufeff", "").strip() for c in out.columns]

    # required for normalization
    col_time = _pick_col(out, ["Time", "Trade Time", "Fill Time", "Timestamp"], "Insert Time(Time)")
    col_symbol = _pick_col(out, ["Symbol", "Instrument", "Inst", "Trading Pair", "Currency Pair"], "Symbol")
    col_side = _pick_col(out, ["Action", "Side", "Direction"], "Side")
    col_qty = _pick_col(out, ["Amount", "Quantity", "Size", "Filled Amount", "Qty"], "Quantity")
    col_price = _pick_col(out, ["Filled Price", "Price", "Fill Price", "Avg Price"], "Price")

    col_trade_id = _pick_col_optional(out, ["id", "Trade ID", "Fill ID", "trade id"])
    col_order_id = _pick_col_optional(out, ["Order id", "Order ID", "order id"])
    col_fee = _pick_col_optional(out, ["Fee", "Trading Fee", "Commission"])
    col_fee_unit = _pick_col_optional(out, ["Fee Unit", "Commission Asset", "Fee Currency", "Fee Coin"])

    std = pd.DataFrame()
    std["Insert Time"] = out[col_time]
    std["Symbol"] = out[col_symbol]
    std["Side"] = out[col_side]
    std["Quantity"] = out[col_qty]
    std["Price"] = out[col_price]

    if col_trade_id:
        std["Trade ID"] = out[col_trade_id]
    if col_order_id:
        std["Order ID"] = out[col_order_id]
    if col_fee:
        std["Fee"] = out[col_fee]
    if col_fee_unit:
        std["Commission Asset"] = out[col_fee_unit]

    return std


def _prepare_binance_to_standard(df: pd.DataFrame) -> pd.DataFrame:
    """
    Приводит Binance CSV к стандарту:
      Symbol, Side, Quantity, Price, Insert Time, Fee?, Commission Asset?
    """
    out = df.copy()
    out.columns = [str(c).replace("\ufeff", "").strip() for c in out.columns]

    col_time = _pick_col(out, ["Insert Time", "Time", "Date(UTC)", "Date (UTC)", "Trade Time"], "Insert Time")
    col_symbol = _pick_col(out, ["Symbol", "Pair", "Market", "Instrument"], "Symbol")
    col_side = _pick_col(out, ["Side", "Action", "Direction"], "Side")
    col_price = _pick_col(out, ["Price", "Avg Price", "Filled Price"], "Price")

    col_qty = None
    for cand in ["Quantity", "Qty", "Executed", "Amount"]:
        try:
            col_qty = _pick_col(out, [cand], "Quantity")
            break
        except Exception:
            pass
    if not col_qty:
        raise ValueError(f"Не найдена колонка количества (Quantity/Qty/Executed/Amount). Колонки: {list(out.columns)}")

    col_fee = _pick_col_optional(out, ["Fee", "Commission", "Trading Fee"])
    col_fee_asset = _pick_col_optional(out, ["Commission Asset", "Fee Unit", "Fee Asset", "Commission Coin"])

    std = pd.DataFrame()
    std["Insert Time"] = out[col_time]
    std["Symbol"] = out[col_symbol]
    std["Side"] = out[col_side]
    std["Quantity"] = out[col_qty]
    std["Price"] = out[col_price]
    if col_fee:
        std["Fee"] = out[col_fee]
    if col_fee_asset:
        std["Commission Asset"] = out[col_fee_asset]

    return std


# -----------------------------
# Normalization
# -----------------------------

def _normalize_unity(df: pd.DataFrame, params: ReconcileParams) -> Tuple[pd.DataFrame, int]:
    need_cols = ["Instrument", "Side", "Transact time", "Price"]
    for c in need_cols:
        if c not in df.columns:
            raise ValueError(f"Unity file missing required column: {c}")

    out = df.copy()
    out["symbol"] = out["Instrument"].map(_extract_symbol_from_unity)
    out["side"] = out["Side"].astype(str).str.strip().str.upper()

    if "Absolute amount" in out.columns:
        out["qty"] = pd.to_numeric(out["Absolute amount"], errors="coerce").abs()
    elif "Amount" in out.columns:
        out["qty"] = pd.to_numeric(out["Amount"], errors="coerce").abs()
    else:
        raise ValueError("Unity file must contain 'Absolute amount' or 'Amount'")

    out["price"] = pd.to_numeric(out["Price"], errors="coerce")

    offset = params.unity_utc_offset_hours
    if offset is None:
        sample = out["Transact time"].dropna().astype(str).head(20).tolist()
        offset = _detect_unity_offset_hours_from_text(sample[0], default_hours=5) if sample else 5

    out["trade_dt_local"] = out["Transact time"].map(_parse_unity_transact_time)
    out["trade_dt_utc"] = out["trade_dt_local"] - pd.Timedelta(hours=int(offset))
    out["minute_utc"] = out["trade_dt_utc"].dt.floor("min")

    out["qty_r"] = out["qty"].map(lambda x: _qround_str(x, params.qty_decimals))
    out["price_r"] = out["price"].map(lambda x: _qround_str(x, params.price_decimals))

    out["match_key"] = (
        out["symbol"].astype(str) + "|" +
        out["side"].astype(str) + "|" +
        out["qty_r"].astype(str) + "|" +
        out["price_r"].astype(str)
    )

    out["notional"] = out["qty"] * out["price"]
    out["notional_r"] = out["notional"].map(lambda x: _qround_str(x, params.notional_decimals))

    if params.notional_use_minute_bucket:
        out["notional_key"] = (
            out["symbol"].astype(str) + "|" +
            out["side"].astype(str) + "|" +
            out["minute_utc"].astype(str) + "|" +
            out["notional_r"].astype(str)
        )
    else:
        out["notional_key"] = (
            out["symbol"].astype(str) + "|" +
            out["side"].astype(str) + "|" +
            out["notional_r"].astype(str)
        )

    return out, int(offset)


def _normalize_exchange_common(
    df: pd.DataFrame,
    params: ReconcileParams,
    *,
    time_offset_hours: int = 0,
    symbol_mapper: Callable[[Any], str] = lambda x: str(x).upper().strip() if x is not None else "",
    action_filter: Optional[set[str]] = None,
) -> pd.DataFrame:
    """
    Standard exchange schema required columns:
      Symbol, Side, Quantity, Price, Insert Time
    Insert Time is treated as LOCAL time with time_offset_hours.
    """
    need_cols = ["Symbol", "Side", "Quantity", "Price", "Insert Time"]
    for c in need_cols:
        if c not in df.columns:
            raise ValueError(f"Exchange file missing required column: {c}. Available: {list(df.columns)}")

    out = df.copy()

    out["Symbol"] = out["Symbol"].map(symbol_mapper)
    out["Side"] = out["Side"].astype(str).str.strip().str.upper()
    out["Quantity"] = pd.to_numeric(out["Quantity"], errors="coerce").abs()
    out["Price"] = pd.to_numeric(out["Price"], errors="coerce")

    if action_filter is not None:
        out = out[out["Side"].isin(action_filter)].copy()

    out["symbol"] = out["Symbol"].astype(str).str.strip().str.upper()
    out["side"] = out["Side"].astype(str).str.strip().str.upper()
    out["qty"] = out["Quantity"]
    out["price"] = out["Price"]

    # dayfirst=True безопасно для DD.MM.YYYY и не ломает ISO 'YYYY-MM-DD ...'
    out["trade_dt_local"] = pd.to_datetime(out["Insert Time"], dayfirst=True, errors="coerce")
    out["trade_dt_utc"] = out["trade_dt_local"] - pd.Timedelta(hours=int(time_offset_hours))
    out["minute_utc"] = out["trade_dt_utc"].dt.floor("min")

    out["qty_r"] = out["qty"].map(lambda x: _qround_str(x, params.qty_decimals))
    out["price_r"] = out["price"].map(lambda x: _qround_str(x, params.price_decimals))

    out["match_key"] = (
        out["symbol"].astype(str) + "|" +
        out["side"].astype(str) + "|" +
        out["qty_r"].astype(str) + "|" +
        out["price_r"].astype(str)
    )

    out["notional"] = out["qty"] * out["price"]
    out["notional_r"] = out["notional"].map(lambda x: _qround_str(x, params.notional_decimals))

    if params.notional_use_minute_bucket:
        out["notional_key"] = (
            out["symbol"].astype(str) + "|" +
            out["side"].astype(str) + "|" +
            out["minute_utc"].astype(str) + "|" +
            out["notional_r"].astype(str)
        )
    else:
        out["notional_key"] = (
            out["symbol"].astype(str) + "|" +
            out["side"].astype(str) + "|" +
            out["notional_r"].astype(str)
        )

    return out


# -----------------------------
# Matching
# -----------------------------

def _within_tol(bv: float, uv: float, rel: float, abs_tol: float) -> bool:
    if pd.isna(bv) or pd.isna(uv):
        return False
    diff = abs(float(uv) - float(bv))
    thresh = max(abs_tol, rel * abs(float(bv)))
    return diff <= thresh


def _group_indices_sorted(df: pd.DataFrame, key_col: str) -> Dict[Any, List[int]]:
    """
    Возвращает {key: [индексы строк]} в порядке времени (trade_dt_utc).
    Без groupby.apply => без FutureWarning.
    """
    if df.empty:
        return {}

    df_sorted = df.sort_values("trade_dt_utc", kind="mergesort")
    idx_map = df_sorted.groupby(key_col, sort=False).indices
    return {k: df_sorted.index.take(pos).tolist() for k, pos in idx_map.items()}


def _reconcile_multiset_by_key(
    unity_n: pd.DataFrame,
    exchange_n: pd.DataFrame,
    key_col: str,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Multiset match по key_col (учитывает дубликаты).
    Матчим по времени (trade_dt_utc), чтобы пары были стабильные и понятные.
    """
    u_groups = _group_indices_sorted(unity_n, key_col)
    e_groups = _group_indices_sorted(exchange_n, key_col)

    matched: List[Tuple[int, int, str]] = []
    missing_ex: List[int] = []
    extra_unity: List[int] = []

    for k, e_idxs in e_groups.items():
        u_idxs = u_groups.get(k, [])
        n = min(len(e_idxs), len(u_idxs))

        for i in range(n):
            matched.append((e_idxs[i], u_idxs[i], str(k)))

        if len(e_idxs) > n:
            missing_ex.extend(e_idxs[n:])
        if len(u_idxs) > n:
            extra_unity.extend(u_idxs[n:])

    for k, u_idxs in u_groups.items():
        if k not in e_groups:
            extra_unity.extend(u_idxs)

    matched_df = pd.DataFrame(matched, columns=["exchange_idx", "unity_idx", "key"])
    missing_df = exchange_n.loc[missing_ex].copy()
    extra_df = unity_n.loc[extra_unity].copy()
    return matched_df, missing_df, extra_df


def _reconcile_fuzzy(
    missing_exchange: pd.DataFrame,
    extra_unity: pd.DataFrame,
    params: ReconcileParams,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Умный FUZZY:
      - совпадает symbol+side
      - время в окне +- time_window_seconds
      - qty/price в пределах толерансов
      - выбираем лучшую пару по score
    Быстрее, чем полный перебор: кандидаты ищутся через searchsorted по времени.
    """
    if missing_exchange.empty or extra_unity.empty:
        return (
            pd.DataFrame(columns=["exchange_idx", "unity_idx", "score"]),
            missing_exchange,
            extra_unity,
        )

    b = missing_exchange.copy()
    u = extra_unity.copy()

    b["_idx"] = b.index.astype(int)
    u["_idx"] = u.index.astype(int)

    b["grp"] = b["symbol"].astype(str) + "|" + b["side"].astype(str)
    u["grp"] = u["symbol"].astype(str) + "|" + u["side"].astype(str)

    b = b.sort_values("trade_dt_utc", kind="mergesort")
    u = u.sort_values("trade_dt_utc", kind="mergesort")

    win = pd.Timedelta(seconds=int(params.time_window_seconds))
    win_ns = np.int64(win.value)

    u_lookup = u.set_index("_idx", drop=False)

    groups: Dict[str, Tuple[np.ndarray, np.ndarray]] = {}
    for grp, g in u.groupby("grp", sort=False):
        times = g["trade_dt_utc"].to_numpy(dtype="datetime64[ns]")
        ids = g["_idx"].to_numpy(dtype=np.int64)
        groups[grp] = (times, ids)

    used_unity: set[int] = set()
    matched_rows: List[Dict[str, Any]] = []

    for _, brow in b.iterrows():
        grp = brow["grp"]
        if grp not in groups:
            continue

        bt = brow["trade_dt_utc"]
        if pd.isna(bt):
            continue

        b_time = np.datetime64(bt.to_datetime64())
        times_u, ids_u = groups[grp]

        left = np.searchsorted(times_u, b_time - np.timedelta64(win_ns, "ns"), side="left")
        right = np.searchsorted(times_u, b_time + np.timedelta64(win_ns, "ns"), side="right")
        if left >= right:
            continue

        b_qty = float(brow["qty"]) if not pd.isna(brow["qty"]) else np.nan
        b_price = float(brow["price"]) if not pd.isna(brow["price"]) else np.nan
        if pd.isna(b_qty) or pd.isna(b_price):
            continue

        best_score = None
        best_uid = None

        for uid in ids_u[left:right]:
            uid_int = int(uid)
            if uid_int in used_unity:
                continue

            urow = u_lookup.loc[uid_int]
            ut = urow["trade_dt_utc"]
            if pd.isna(ut):
                continue

            u_qty = float(urow["qty"]) if not pd.isna(urow["qty"]) else np.nan
            u_price = float(urow["price"]) if not pd.isna(urow["price"]) else np.nan
            if pd.isna(u_qty) or pd.isna(u_price):
                continue

            if not _within_tol(b_qty, u_qty, params.qty_rel_tol, params.qty_abs_tol):
                continue
            if not _within_tol(b_price, u_price, params.price_rel_tol, params.price_abs_tol):
                continue

            dt_sec = abs((ut - bt).total_seconds())
            qty_rel = abs(u_qty - b_qty) / (abs(b_qty) if abs(b_qty) > 0 else 1.0)
            price_rel = abs(u_price - b_price) / (abs(b_price) if abs(b_price) > 0 else 1.0)
            score = dt_sec + 1000.0 * qty_rel + 1000.0 * price_rel

            if best_score is None or score < best_score:
                best_score = score
                best_uid = uid_int

        if best_uid is not None:
            used_unity.add(best_uid)
            matched_rows.append({"exchange_idx": int(brow["_idx"]), "unity_idx": int(best_uid), "score": float(best_score)})

    matched_fuzzy = pd.DataFrame(matched_rows, columns=["exchange_idx", "unity_idx", "score"])

    if not matched_fuzzy.empty:
        matched_b = set(matched_fuzzy["exchange_idx"].tolist())
        matched_u = set(matched_fuzzy["unity_idx"].tolist())
        missing_after = missing_exchange[~missing_exchange.index.isin(matched_b)].copy()
        extra_after = extra_unity[~extra_unity.index.isin(matched_u)].copy()
    else:
        missing_after = missing_exchange
        extra_after = extra_unity

    return matched_fuzzy, missing_after, extra_after


# -----------------------------
# Volume reconciliation (by symbol)
# -----------------------------

def _agg_volume(df: pd.DataFrame, by_side: bool) -> pd.DataFrame:
    keys = ["symbol"] + (["side"] if by_side else [])
    g = (
        df.groupby(keys, dropna=False)
        .agg(
            trades=("symbol", "size"),
            qty_sum=("qty", "sum"),
            notional_sum=("notional", "sum"),
            first_time=("trade_dt_utc", "min"),
            last_time=("trade_dt_utc", "max"),
        )
        .reset_index()
    )
    return g


def _compare_volume(
    agg_ex: pd.DataFrame,
    agg_u: pd.DataFrame,
    by_side: bool,
    params: ReconcileParams,
) -> pd.DataFrame:
    keys = ["symbol"] + (["side"] if by_side else [])
    m = agg_ex.merge(agg_u, on=keys, how="outer", suffixes=("_exchange", "_unity"))

    for col in ["trades", "qty_sum", "notional_sum"]:
        ce = f"{col}_exchange"
        cu = f"{col}_unity"
        if ce not in m.columns:
            m[ce] = 0
        if cu not in m.columns:
            m[cu] = 0
        m[ce] = m[ce].fillna(0)
        m[cu] = m[cu].fillna(0)

    m["qty_diff"] = m["qty_sum_unity"] - m["qty_sum_exchange"]
    m["notional_diff"] = m["notional_sum_unity"] - m["notional_sum_exchange"]

    statuses: List[str] = []
    for tb, tu, qb, qu, nb, nu in zip(
        m["trades_exchange"], m["trades_unity"],
        m["qty_sum_exchange"], m["qty_sum_unity"],
        m["notional_sum_exchange"], m["notional_sum_unity"],
    ):
        if tb == 0 and tu > 0:
            statuses.append("Только Unity")
            continue
        if tu == 0 and tb > 0:
            statuses.append("Только Биржа")
            continue

        qty_ok = _within_tol(qb, qu, params.volume_qty_rel_tol, params.volume_qty_abs_tol)
        not_ok = _within_tol(nb, nu, params.volume_notional_rel_tol, params.volume_notional_abs_tol)
        statuses.append("OK" if (qty_ok and not_ok) else "Расхождение")

    m["status"] = statuses

    m["qty_sum_exchange"] = m["qty_sum_exchange"].map(lambda x: _qround_float(x, params.qty_decimals))
    m["qty_sum_unity"] = m["qty_sum_unity"].map(lambda x: _qround_float(x, params.qty_decimals))
    m["qty_diff"] = m["qty_diff"].map(lambda x: _qround_float(x, params.qty_decimals))

    m["notional_sum_exchange"] = m["notional_sum_exchange"].map(lambda x: _qround_float(x, params.notional_decimals))
    m["notional_sum_unity"] = m["notional_sum_unity"].map(lambda x: _qround_float(x, params.notional_decimals))
    m["notional_diff"] = m["notional_diff"].map(lambda x: _qround_float(x, params.notional_decimals))

    m["_abs_not"] = pd.to_numeric(m["notional_diff"], errors="coerce").abs()
    m = m.sort_values("_abs_not", ascending=False).drop(columns=["_abs_not"])
    return m


# -----------------------------
# Debug helpers (optional)
# -----------------------------

def _top_key_diffs(unity_n: pd.DataFrame, exchange_n: pd.DataFrame, key_col: str, limit: int = 50) -> pd.DataFrame:
    u_cnt = unity_n[key_col].value_counts()
    e_cnt = exchange_n[key_col].value_counts()
    diff = (u_cnt.subtract(e_cnt, fill_value=0)).sort_values(key=lambda s: s.abs(), ascending=False)
    out = diff.head(limit).reset_index()
    out.columns = [key_col, "unity_count_minus_exchange_count"]
    return out


# -----------------------------
# Pretty report helpers
# -----------------------------

def _cols(df: pd.DataFrame, ordered: List[str]) -> List[str]:
    return [c for c in ordered if c in df.columns]


def _safe_rename(df: pd.DataFrame, mapping: Dict[str, str]) -> pd.DataFrame:
    m = {k: v for k, v in mapping.items() if k in df.columns}
    return df.rename(columns=m)


def _build_pretty_tables(
    matched_all: pd.DataFrame,
    exchange_n: pd.DataFrame,
    unity_n: pd.DataFrame,
    missing_in_unity: pd.DataFrame,
    extra_in_unity: pd.DataFrame,
    ex_status: pd.DataFrame,
    uni_status: pd.DataFrame,
    volume_by_symbol: Optional[pd.DataFrame],
    volume_by_symbol_side: Optional[pd.DataFrame],
    *,
    exchange_name: str,
    params: ReconcileParams,
) -> Dict[str, Optional[pd.DataFrame]]:
    exn = exchange_name.strip().lower()
    prefix = "B" if exn == "binance" else ("O" if exn == "okx" else "X")
    p = f"{prefix}_"

    ex_sel = exchange_n.reset_index().rename(columns={"index": "exchange_idx"})
    u_sel = unity_n.reset_index().rename(columns={"index": "unity_idx"})

    ex_keep = _cols(ex_sel, [
        "exchange_idx",
        "Trade ID", "Order ID", "Insert Time",
        "trade_dt_utc",
        "symbol", "side", "qty", "price", "notional",
        "Fee", "Commission Asset",
    ])
    u_keep = _cols(u_sel, [
        "unity_idx",
        "ID", "Transact time",
        "trade_dt_utc",
        "Instrument",
        "symbol", "side", "qty", "price", "notional",
        "Net commission amount",
    ])

    ex_view = ex_sel[ex_keep].copy()
    u_view = u_sel[u_keep].copy()

    ex_view = _safe_rename(ex_view, {
        "Trade ID": f"{p}TradeID",
        "Order ID": f"{p}OrderID",
        "Insert Time": f"{p}Время",
        "trade_dt_utc": f"{p}UTC",
        "symbol": f"{p}Символ",
        "side": f"{p}Сторона",
        "qty": f"{p}Qty",
        "price": f"{p}Цена",
        "notional": f"{p}Объем",
        "Fee": f"{p}Fee",
        "Commission Asset": f"{p}Комиссия_Asset",
    })

    u_view = _safe_rename(u_view, {
        "ID": "U_ID",
        "Transact time": "U_Время",
        "trade_dt_utc": "U_UTC",
        "Instrument": "U_Instrument",
        "symbol": "U_Символ",
        "side": "U_Сторона",
        "qty": "U_Qty",
        "price": "U_Цена",
        "notional": "U_Объем",
        "Net commission amount": "U_Комиссия",
    })

    # 01_Совпадения
    m = matched_all.copy()
    if "score" not in m.columns:
        m["score"] = np.nan
    if "key_used" not in m.columns:
        m["key_used"] = ""

    m = m.merge(ex_view, on="exchange_idx", how="left").merge(u_view, on="unity_idx", how="left")

    # --- Deltas ---
    ex_utc = f"{p}UTC"
    ex_qty = f"{p}Qty"
    ex_price = f"{p}Цена"
    ex_not = f"{p}Объем"

    if ex_utc in m.columns and "U_UTC" in m.columns:
        t1 = pd.to_datetime(m[ex_utc], errors="coerce")
        t2 = pd.to_datetime(m["U_UTC"], errors="coerce")
        m["Δt_sec"] = (t1 - t2).abs().dt.total_seconds()

    if ex_qty in m.columns and "U_Qty" in m.columns:
        m["ΔQty"] = pd.to_numeric(m[ex_qty], errors="coerce") - pd.to_numeric(m["U_Qty"], errors="coerce")

    if ex_price in m.columns and "U_Цена" in m.columns:
        m["ΔЦена"] = pd.to_numeric(m[ex_price], errors="coerce") - pd.to_numeric(m["U_Цена"], errors="coerce")

    if ex_not in m.columns and "U_Объем" in m.columns:
        m["ΔОбъем"] = pd.to_numeric(m[ex_not], errors="coerce") - pd.to_numeric(m["U_Объем"], errors="coerce")

    m = _safe_rename(m, {
        "match_type": "Тип_совпадения",
        "key_used": "Ключ",
        "score": "Score",
        "exchange_idx": "Биржа_idx",
        "unity_idx": "Unity_idx",
    })

    # Сортировка: сначала большие расхождения
    if "ΔОбъем" in m.columns:
        m["_abs_diff"] = pd.to_numeric(m["ΔОбъем"], errors="coerce").abs()
        m = m.sort_values(["_abs_diff"], ascending=False).drop(columns=["_abs_diff"])
    elif "Δt_sec" in m.columns:
        m = m.sort_values(["Δt_sec"], ascending=True)

    # Колонки
    full_front = [c for c in [
        "Тип_совпадения", "Ключ", "Score", "Δt_sec", "ΔQty", "ΔЦена", "ΔОбъем",
        f"{p}TradeID", f"{p}OrderID", f"{p}Время", f"{p}UTC", f"{p}Символ", f"{p}Сторона", f"{p}Qty", f"{p}Цена", f"{p}Объем",
        "U_ID", "U_Время", "U_UTC", "U_Instrument", "U_Символ", "U_Сторона", "U_Qty", "U_Цена", "U_Объем",
        "Биржа_idx", "Unity_idx",
    ] if c in m.columns]
    rest = [c for c in m.columns if c not in full_front]
    m_pretty = m[full_front + rest].copy()

    if params.export_mode == "compact":
        compact_cols = [c for c in [
            "Тип_совпадения",
            "Δt_sec", "ΔQty", "ΔЦена", "ΔОбъем",
            f"{p}TradeID", f"{p}OrderID",
            f"{p}Время", f"{p}UTC", f"{p}Символ", f"{p}Сторона",
            f"{p}Qty", f"{p}Цена", f"{p}Объем",
            "U_ID", "U_Время", "U_UTC", "U_Instrument", "U_Символ", "U_Сторона",
            "U_Qty", "U_Цена", "U_Объем",
        ] if c in m_pretty.columns]
        m_pretty = m_pretty[compact_cols].copy()

    # 02_Нет_в_Unity
    miss = missing_in_unity.copy()
    miss = _safe_rename(miss, {
        "Trade ID": "TradeID",
        "Order ID": "OrderID",
        "Insert Time": "Время",
        "symbol": "Символ",
        "side": "Сторона",
        "qty": "Qty",
        "price": "Цена",
        "notional": "Объем",
        "Fee": "Fee",
        "Commission Asset": "Комиссия_Asset",
    })
    miss_cols = _cols(miss, ["TradeID", "OrderID", "Время", "Символ", "Сторона", "Qty", "Цена", "Объем", "Fee", "Комиссия_Asset"])
    miss_pretty = miss[miss_cols].copy() if miss_cols else miss
    if "Символ" in miss_pretty.columns and "Время" in miss_pretty.columns:
        miss_pretty = miss_pretty.sort_values(["Символ", "Время"], ascending=[True, True])

    # 03_Лишнее_в_Unity
    extra = extra_in_unity.copy()
    extra = _safe_rename(extra, {
        "ID": "ID",
        "Transact time": "Время",
        "Instrument": "Instrument",
        "symbol": "Символ",
        "side": "Сторона",
        "qty": "Qty",
        "price": "Цена",
        "notional": "Объем",
        "Net commission amount": "Комиссия",
    })
    extra_cols = _cols(extra, ["ID", "Время", "Instrument", "Символ", "Сторона", "Qty", "Цена", "Объем", "Комиссия"])
    extra_pretty = extra[extra_cols].copy() if extra_cols else extra
    if "Символ" in extra_pretty.columns and "Время" in extra_pretty.columns:
        extra_pretty = extra_pretty.sort_values(["Символ", "Время"], ascending=[True, True])

    # 04/05 Статусы
    exs = ex_status.copy()
    uns = uni_status.copy()

    # Exchange -> Unity ID (по matched_unity_idx)
    u_id_map: Dict[int, Any] = unity_n["ID"].to_dict() if "ID" in unity_n.columns else {}
    if "matched_unity_idx" in exs.columns:
        def _map_uid(x: Any) -> str:
            try:
                if pd.isna(x):
                    return ""
                return str(u_id_map.get(int(x), ""))
            except Exception:
                return ""
        exs["matched_unity_id"] = exs["matched_unity_idx"].map(_map_uid)
    else:
        exs["matched_unity_id"] = ""

    exs = _safe_rename(exs, {
        "status": "Статус",
        "Trade ID": "TradeID",
        "Order ID": "OrderID",
        "Insert Time": "Время",
        "symbol": "Символ",
        "side": "Сторона",
        "qty": "Qty",
        "price": "Цена",
        "notional": "Объем",
        "matched_unity_id": "Связанный_Unity_ID",
    })
    exs_cols = _cols(exs, ["Статус", "TradeID", "OrderID", "Время", "Символ", "Сторона", "Qty", "Цена", "Объем", "Связанный_Unity_ID"])
    exs_pretty = exs[exs_cols].copy() if exs_cols else exs

    # Unity -> Exchange Trade ID (по matched_exchange_idx)
    ex_tid_map: Dict[int, Any] = exchange_n["Trade ID"].to_dict() if "Trade ID" in exchange_n.columns else {}
    if "matched_exchange_idx" in uns.columns:
        def _map_etid(x: Any) -> str:
            try:
                if pd.isna(x):
                    return ""
                return str(ex_tid_map.get(int(x), ""))
            except Exception:
                return ""
        uns["matched_trade_id"] = uns["matched_exchange_idx"].map(_map_etid)
    else:
        uns["matched_trade_id"] = ""

    uns = _safe_rename(uns, {
        "status": "Статус",
        "ID": "ID",
        "Transact time": "Время",
        "Instrument": "Instrument",
        "symbol": "Символ",
        "side": "Сторона",
        "qty": "Qty",
        "price": "Цена",
        "notional": "Объем",
        "matched_trade_id": f"Связанный_{exchange_name}_TradeID",
    })
    uns_cols = _cols(uns, ["Статус", "ID", "Время", "Instrument", "Символ", "Сторона", "Qty", "Цена", "Объем", f"Связанный_{exchange_name}_TradeID"])
    uns_pretty = uns[uns_cols].copy() if uns_cols else uns

    # Volume pretty
    def _vol_pretty(v: Optional[pd.DataFrame]) -> Optional[pd.DataFrame]:
        if v is None:
            return None
        vv = v.copy()
        vv = _safe_rename(vv, {
            "symbol": "Символ",
            "side": "Сторона",
            "trades_exchange": f"Сделок_{exchange_name}",
            "trades_unity": "Сделок_Unity",
            "qty_sum_exchange": f"Qty_{exchange_name}",
            "qty_sum_unity": "Qty_Unity",
            "qty_diff": "ΔQty",
            "notional_sum_exchange": f"Объем_{exchange_name}",
            "notional_sum_unity": "Объем_Unity",
            "notional_diff": "ΔОбъем",
            "first_time_exchange": f"Время_первое_{exchange_name}",
            "last_time_exchange": f"Время_последнее_{exchange_name}",
            "first_time_unity": "Время_первое_Unity",
            "last_time_unity": "Время_последнее_Unity",
            "status": "Статус",
        })

        # sort by abs ΔОбъем
        if "ΔОбъем" in vv.columns:
            vv["_absV"] = pd.to_numeric(vv["ΔОбъем"], errors="coerce").abs()
            vv = vv.sort_values(["_absV"], ascending=False).drop(columns=["_absV"])

        front_cols = _cols(vv, [
            "Статус", "Символ", "Сторона",
            f"Qty_{exchange_name}", "Qty_Unity", "ΔQty",
            f"Объем_{exchange_name}", "Объем_Unity", "ΔОбъем",
            f"Сделок_{exchange_name}", "Сделок_Unity",
            f"Время_первое_{exchange_name}", f"Время_последнее_{exchange_name}",
            "Время_первое_Unity", "Время_последнее_Unity",
        ])
        rest2 = [c for c in vv.columns if c not in front_cols]
        return vv[front_cols + rest2].copy()

    return {
        "matched": m_pretty,
        "missing": miss_pretty,
        "extra": extra_pretty,
        "ex_status": exs_pretty,
        "uni_status": uns_pretty,
        "vol_sym": _vol_pretty(volume_by_symbol),
        "vol_ss": _vol_pretty(volume_by_symbol_side),
    }


# -----------------------------
# Export XLSX + Styling
# -----------------------------

def _clean_df_for_excel(df: pd.DataFrame) -> pd.DataFrame:
    """
    Убирает "nan/NaT" как текст и бесконечности.
    Обычный NaN в to_excel и так будет пустой — но это помогает, если колонку где-то привели к str.
    """
    out = df.copy()
    out = out.replace([np.inf, -np.inf], np.nan)
    for c in out.columns:
        if out[c].dtype == object:
            out[c] = out[c].replace({"nan": "", "NaN": "", "NaT": "", "None": ""})
    return out


def _export_report_xlsx(
    report_path: Path,
    summary: ReconcileSummary,
    params: ReconcileParams,
    exchange_name: str,
    matched_pretty: pd.DataFrame,
    missing_pretty: pd.DataFrame,
    extra_pretty: pd.DataFrame,
    ex_status_pretty: pd.DataFrame,
    unity_status_pretty: pd.DataFrame,
    volume_by_symbol_pretty: Optional[pd.DataFrame],
    volume_by_symbol_side_pretty: Optional[pd.DataFrame],
    # debug
    top_diffs_strict: Optional[pd.DataFrame] = None,
    top_diffs_notional: Optional[pd.DataFrame] = None,
    raw_exchange: Optional[pd.DataFrame] = None,
    raw_unity: Optional[pd.DataFrame] = None,
) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)

    summary_df = pd.DataFrame(
        {
            "Показатель": [
                f"Строк {exchange_name}",
                "Строк Unity",
                "Совпало STRICT",
                "Совпало FUZZY",
                "Совпало NOTIONAL (qty*price)",
                "Нет в Unity (есть в бирже)",
                "Лишнее в Unity (нет в бирже)",
                f"Объем: символов {exchange_name}",
                "Объем: символов Unity",
                "Объем: OK",
                "Объем: Расхождение",
                f"Объем: Только {exchange_name}",
                "Объем: Только Unity",
                f"Объем: Σ Qty {exchange_name}",
                "Объем: Σ Qty Unity",
                f"Объем: Σ Notional {exchange_name}",
                "Объем: Σ Notional Unity",
                f"Диапазон времени {exchange_name} (UTC)",
                "Диапазон времени Unity (UTC)",
                "Warning",
            ],
            "Значение": [
                summary.rows_exchange,
                summary.rows_unity,
                summary.matched_strict,
                summary.matched_fuzzy,
                summary.matched_notional,
                summary.missing_in_unity,
                summary.extra_in_unity,
                summary.volume_symbols_exchange,
                summary.volume_symbols_unity,
                summary.volume_symbols_ok,
                summary.volume_symbols_diff,
                summary.volume_symbols_only_exchange,
                summary.volume_symbols_only_unity,
                summary.volume_total_qty_exchange,
                summary.volume_total_qty_unity,
                summary.volume_total_notional_exchange,
                summary.volume_total_notional_unity,
                summary.exchange_time_range_utc,
                summary.unity_time_range_utc,
                summary.warning,
            ],
        }
    )

    with pd.ExcelWriter(report_path, engine="openpyxl") as writer:
        _clean_df_for_excel(summary_df).to_excel(writer, sheet_name="00_Сводка", index=False)

        _clean_df_for_excel(matched_pretty).to_excel(writer, sheet_name="01_Совпадения", index=False)
        _clean_df_for_excel(missing_pretty).to_excel(writer, sheet_name="02_Нет_в_Unity", index=False)
        _clean_df_for_excel(extra_pretty).to_excel(writer, sheet_name="03_Лишнее_в_Unity", index=False)

        _clean_df_for_excel(ex_status_pretty).to_excel(writer, sheet_name=f"04_Статус_{exchange_name}", index=False)
        _clean_df_for_excel(unity_status_pretty).to_excel(writer, sheet_name="05_Статус_Unity", index=False)

        if volume_by_symbol_pretty is not None:
            _clean_df_for_excel(volume_by_symbol_pretty).to_excel(writer, sheet_name="06_Объем_Инстр", index=False)
        if volume_by_symbol_side_pretty is not None:
            _clean_df_for_excel(volume_by_symbol_side_pretty).to_excel(writer, sheet_name="07_Объем_Инстр_Сторона", index=False)

        if params.export_debug_sheets:
            if top_diffs_strict is not None:
                _clean_df_for_excel(top_diffs_strict).to_excel(writer, sheet_name="90_TopDiffs_STRICT", index=False)
            if top_diffs_notional is not None:
                _clean_df_for_excel(top_diffs_notional).to_excel(writer, sheet_name="91_TopDiffs_Объем", index=False)
            if raw_exchange is not None:
                _clean_df_for_excel(raw_exchange).to_excel(writer, sheet_name=f"RAW_{exchange_name}", index=False)
            if raw_unity is not None:
                _clean_df_for_excel(raw_unity).to_excel(writer, sheet_name="RAW_Unity", index=False)

    _style_workbook(report_path, params)


def _apply_excel_table(ws) -> None:
    """Делает лист таблицей Excel (полоски, фильтры, аккуратный вид)."""
    if ws.max_row < 2 or ws.max_column < 1:
        return

    safe = re.sub(r"[^A-Za-z0-9_]", "_", ws.title)
    name = f"T_{safe}"[:250]

    tab = Table(displayName=name, ref=ws.dimensions)
    tab.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    ws.add_table(tab)


def _style_workbook(report_path: Path, params: ReconcileParams) -> None:
    wb = load_workbook(report_path)

    for ws in wb.worksheets:
        if ws.max_row < 1 or ws.max_column < 1:
            continue

        _apply_sheet_basics(ws)
        _apply_header_style(ws)
        _apply_auto_filter(ws)
        _apply_excel_table(ws)
        _apply_column_formats(ws, params)
        _apply_conditional_styles(ws)
        _autosize_columns(ws)

    wb.save(report_path)


def _apply_sheet_basics(ws) -> None:
    ws.freeze_panes = "A2" if ws.max_row >= 2 else "A1"


def _apply_header_style(ws) -> None:
    if ws.max_row < 1 or ws.max_column < 1:
        return

    header_fill = PatternFill("solid", fgColor="F2F2F2")
    header_font = Font(bold=True)
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for col in range(1, ws.max_column + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_align

    ws.row_dimensions[1].height = 22


def _apply_auto_filter(ws) -> None:
    if ws.max_row >= 2 and ws.max_column >= 1:
        ws.auto_filter.ref = ws.dimensions


def _find_col_by_header(ws, header_name: str) -> Optional[int]:
    for col in range(1, ws.max_column + 1):
        v = ws.cell(row=1, column=col).value
        if isinstance(v, str) and v.strip() == header_name:
            return col
    return None


def _apply_column_formats(ws, params: ReconcileParams) -> None:
    if ws.max_row < 2 or ws.max_column < 1:
        return

    qty_fmt = "0." + ("0" * max(0, int(params.qty_decimals)))
    price_fmt = "0." + ("0" * max(0, int(params.price_decimals)))
    notional_fmt = "0." + ("0" * max(0, int(params.notional_decimals)))
    score_fmt = "0.00"
    dt_fmt = "yyyy-mm-dd hh:mm:ss"

    for col in range(1, ws.max_column + 1):
        header = ws.cell(row=1, column=col).value
        if not isinstance(header, str):
            continue
        h = header.strip()

        if ("UTC" in h) or ("Время" in h) or ("Time" in h):
            for r in range(2, ws.max_row + 1):
                ws.cell(row=r, column=col).number_format = dt_fmt
            continue

        if h in {"Score", "Δt_sec"}:
            for r in range(2, ws.max_row + 1):
                ws.cell(row=r, column=col).number_format = score_fmt
            continue

        if ("Qty" in h) or (h == "ΔQty") or ("Количество" in h):
            for r in range(2, ws.max_row + 1):
                ws.cell(row=r, column=col).number_format = qty_fmt
            continue

        if ("Цена" in h) or ("Price" in h):
            for r in range(2, ws.max_row + 1):
                ws.cell(row=r, column=col).number_format = price_fmt
            continue

        if ("Объем" in h) or (h == "ΔОбъем") or ("Notional" in h) or ("Volume" in h):
            for r in range(2, ws.max_row + 1):
                ws.cell(row=r, column=col).number_format = notional_fmt
            continue


def _apply_conditional_styles(ws) -> None:
    if ws.max_row < 2 or ws.max_column < 1:
        return

    full_range = f"A2:{get_column_letter(ws.max_column)}{ws.max_row}"

    fill_ok = PatternFill("solid", fgColor="E8F5E9")
    fill_warn = PatternFill("solid", fgColor="FFF8E1")
    fill_bad = PatternFill("solid", fgColor="FFEBEE")
    fill_info = PatternFill("solid", fgColor="E3F2FD")

    status_col = _find_col_by_header(ws, "Статус")
    if status_col:
        colL = get_column_letter(status_col)

        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'${colL}2="OK"'], fill=fill_ok))
        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'${colL}2="Расхождение"'], fill=fill_bad))
        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'LEFT(${colL}2,5)="Только"'], fill=fill_warn))

        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'LEFT(${colL}2,7)="СОВПАЛО"'], fill=fill_ok))
        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'LEFT(${colL}2,4)="НЕТ_"'], fill=fill_bad))
        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'LEFT(${colL}2,7)="ЛИШНЕЕ_"'], fill=fill_warn))

    mt_col = _find_col_by_header(ws, "Тип_совпадения")
    if mt_col:
        colM = get_column_letter(mt_col)
        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'${colM}2="STRICT"'], fill=fill_ok))
        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'${colM}2="FUZZY"'], fill=fill_warn))
        ws.conditional_formatting.add(full_range, FormulaRule(formula=[f'${colM}2="NOTIONAL"'], fill=fill_info))


def _autosize_columns(ws, sample_rows: int = 2000) -> None:
    if ws.max_column < 1:
        return

    max_r = min(ws.max_row, sample_rows)

    for col in range(1, ws.max_column + 1):
        letter = get_column_letter(col)
        best = 8
        for row in range(1, max_r + 1):
            v = ws.cell(row=row, column=col).value
            if v is None:
                continue
            s = str(v)
            if len(s) > best:
                best = len(s)
        ws.column_dimensions[letter].width = min(max(best + 2, 10), 60)


# -----------------------------
# Public API
# -----------------------------

def reconcile_to_report(
    unity_xlsx_path: Path,
    exchange_path: Path,
    report_dir: Path,
    exchange_type: str = "BINANCE",  # "BINANCE" | "OKX"
    params: Optional[ReconcileParams] = None,
) -> ReconcileResult:
    params = params or ReconcileParams()
    exchange_type = exchange_type.upper().strip()
    if exchange_type not in {"BINANCE", "OKX"}:
        raise ValueError(f"Unsupported exchange_type: {exchange_type}")

    unity_raw = pd.read_excel(unity_xlsx_path)

    exchange_offset = 0
    symbol_mapper: Callable[[Any], str] = lambda x: str(x).upper().strip() if x is not None else ""
    action_filter: Optional[set[str]] = None

    if exchange_type == "BINANCE":
        exchange_raw0 = _read_binance_csv(exchange_path, params.binance_delimiter)
        exchange_raw = _prepare_binance_to_standard(exchange_raw0)

        exchange_name = "Binance"
        exchange_offset = 0  # Binance Date(UTC) обычно UTC
        symbol_mapper = lambda x: re.sub(r"[^A-Z0-9]", "", str(x).upper()) if x is not None else ""
        action_filter = {"BUY", "SELL"}
    else:
        okx_df, tz = _read_okx_xlsx(exchange_path)
        exchange_raw = _prepare_okx_to_standard(okx_df)

        exchange_name = "OKX"
        detected = tz
        exchange_offset = (
            int(params.okx_utc_offset_hours)
            if params.okx_utc_offset_hours is not None
            else (int(detected) if detected is not None else 0)
        )
        symbol_mapper = _extract_symbol_from_okx
        action_filter = {"BUY", "SELL"} if params.okx_filter_trade_actions else None

    unity_n, used_unity_offset = _normalize_unity(unity_raw, params)
    exchange_n = _normalize_exchange_common(
        exchange_raw,
        params,
        time_offset_hours=exchange_offset,
        symbol_mapper=symbol_mapper,
        action_filter=action_filter,
    )

    # 1) STRICT
    matched_strict, missing_in_unity, extra_in_unity = _reconcile_multiset_by_key(unity_n, exchange_n, "match_key")

    # 2) FUZZY
    matched_fuzzy = pd.DataFrame(columns=["exchange_idx", "unity_idx", "score"])
    matched_fuzzy_count = 0
    if params.enable_fuzzy:
        matched_fuzzy, missing_in_unity, extra_in_unity = _reconcile_fuzzy(missing_in_unity, extra_in_unity, params)
        matched_fuzzy_count = int(len(matched_fuzzy))

    # 3) NOTIONAL fallback
    matched_notional = pd.DataFrame(columns=["exchange_idx", "unity_idx", "key"])
    matched_notional_count = 0
    if params.enable_notional_fallback:
        matched_notional, missing_in_unity, extra_in_unity = _reconcile_multiset_by_key(
            extra_in_unity, missing_in_unity, "notional_key"
        )
        matched_notional_count = int(len(matched_notional))

    # matched_all
    parts = []
    if not matched_strict.empty:
        parts.append(matched_strict.assign(match_type="STRICT").rename(columns={"key": "key_used"}))
    if not matched_fuzzy.empty:
        parts.append(matched_fuzzy.assign(match_type="FUZZY").assign(key_used=""))
    if not matched_notional.empty:
        parts.append(matched_notional.assign(match_type="NOTIONAL").rename(columns={"key": "key_used"}))

    matched_all = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(
        columns=["exchange_idx", "unity_idx", "match_type", "key_used", "score"]
    )

    # Status tables
    ex_status = exchange_n.copy()
    ex_status["status"] = "НЕТ_В_UNITY"
    ex_status["matched_unity_idx"] = np.nan

    uni_status = unity_n.copy()
    uni_status["status"] = "ЛИШНЕЕ_В_UNITY"
    uni_status["matched_exchange_idx"] = np.nan

    def _apply_matches(mdf: pd.DataFrame, label: str):
        if mdf is None or mdf.empty:
            return
        for _, r in mdf.iterrows():
            eidx = int(r["exchange_idx"])
            uidx = int(r["unity_idx"])
            ex_status.loc[eidx, "status"] = f"СОВПАЛО_{label}"
            ex_status.loc[eidx, "matched_unity_idx"] = uidx
            uni_status.loc[uidx, "status"] = f"СОВПАЛО_{label}"
            uni_status.loc[uidx, "matched_exchange_idx"] = eidx

    _apply_matches(matched_strict, "STRICT")
    _apply_matches(matched_fuzzy, "FUZZY")
    _apply_matches(matched_notional, "ОБЪЕМ")

    ex_range = f"{exchange_n['trade_dt_utc'].min()} → {exchange_n['trade_dt_utc'].max()}"
    u_range = f"{unity_n['trade_dt_utc'].min()} → {unity_n['trade_dt_utc'].max()}"

    warning = ""
    ex_min = exchange_n["trade_dt_utc"].min()
    ex_max = exchange_n["trade_dt_utc"].max()
    u_min = unity_n["trade_dt_utc"].min()
    u_max = unity_n["trade_dt_utc"].max()

    if pd.notna(ex_min) and pd.notna(ex_max) and pd.notna(u_min) and pd.notna(u_max):
        if u_min < ex_min or u_max > ex_max:
            warning = (
                f"Unity time range выходит за диапазон {exchange_name}. "
                f"Проверь период выгрузки/таймзону. "
                f"Unity UTC offset: {used_unity_offset}; {exchange_name} offset used: {exchange_offset}"
            )

    # Volume recon
    volume_by_symbol = None
    volume_by_symbol_side = None

    vol_symbols_exchange = 0
    vol_symbols_unity = 0
    vol_ok = 0
    vol_diff = 0
    vol_only_exchange = 0
    vol_only_unity = 0

    if params.enable_volume_recon:
        agg_ex_sym = _agg_volume(exchange_n, by_side=False)
        agg_u_sym = _agg_volume(unity_n, by_side=False)
        volume_by_symbol = _compare_volume(agg_ex_sym, agg_u_sym, by_side=False, params=params)

        vol_symbols_exchange = int(agg_ex_sym["symbol"].nunique())
        vol_symbols_unity = int(agg_u_sym["symbol"].nunique())
        vol_ok = int((volume_by_symbol["status"] == "OK").sum())
        vol_diff = int((volume_by_symbol["status"] == "Расхождение").sum())
        vol_only_exchange = int((volume_by_symbol["status"] == "Только Биржа").sum())
        vol_only_unity = int((volume_by_symbol["status"] == "Только Unity").sum())

        if params.volume_group_by_side:
            agg_ex_ss = _agg_volume(exchange_n, by_side=True)
            agg_u_ss = _agg_volume(unity_n, by_side=True)
            volume_by_symbol_side = _compare_volume(agg_ex_ss, agg_u_ss, by_side=True, params=params)

    vol_total_qty_ex = float(np.nansum(exchange_n["qty"]))
    vol_total_qty_u = float(np.nansum(unity_n["qty"]))
    vol_total_not_ex = float(np.nansum(exchange_n["notional"]))
    vol_total_not_u = float(np.nansum(unity_n["notional"]))

    summary = ReconcileSummary(
        exchange_name=exchange_name,
        rows_exchange=int(len(exchange_n)),
        rows_unity=int(len(unity_n)),

        matched_strict=int(len(matched_strict)),
        matched_fuzzy=int(matched_fuzzy_count),
        matched_notional=int(matched_notional_count),

        missing_in_unity=int(len(missing_in_unity)),
        extra_in_unity=int(len(extra_in_unity)),

        volume_symbols_exchange=vol_symbols_exchange,
        volume_symbols_unity=vol_symbols_unity,
        volume_symbols_ok=vol_ok,
        volume_symbols_diff=vol_diff,
        volume_symbols_only_exchange=vol_only_exchange,
        volume_symbols_only_unity=vol_only_unity,
        volume_total_qty_exchange=_qround_float(vol_total_qty_ex, params.qty_decimals),
        volume_total_qty_unity=_qround_float(vol_total_qty_u, params.qty_decimals),
        volume_total_notional_exchange=_qround_float(vol_total_not_ex, params.notional_decimals),
        volume_total_notional_unity=_qround_float(vol_total_not_u, params.notional_decimals),

        exchange_time_range_utc=ex_range,
        unity_time_range_utc=u_range,
        warning=warning,
    )

    pretty = _build_pretty_tables(
        matched_all=matched_all,
        exchange_n=exchange_n,
        unity_n=unity_n,
        missing_in_unity=missing_in_unity,
        extra_in_unity=extra_in_unity,
        ex_status=ex_status,
        uni_status=uni_status,
        volume_by_symbol=volume_by_symbol,
        volume_by_symbol_side=volume_by_symbol_side,
        exchange_name=exchange_name,
        params=params,
    )

    report_id = str(uuid.uuid4())
    report_path = report_dir / f"unity_vs_{exchange_name.lower()}_{report_id}.xlsx"

    top_diffs_strict = _top_key_diffs(unity_n, exchange_n, "match_key", limit=50) if params.export_debug_sheets else None
    top_diffs_notional = _top_key_diffs(unity_n, exchange_n, "notional_key", limit=50) if params.export_debug_sheets else None

    _export_report_xlsx(
        report_path=report_path,
        summary=summary,
        params=params,
        exchange_name=exchange_name,
        matched_pretty=pretty["matched"],          # type: ignore[arg-type]
        missing_pretty=pretty["missing"],          # type: ignore[arg-type]
        extra_pretty=pretty["extra"],              # type: ignore[arg-type]
        ex_status_pretty=pretty["ex_status"],      # type: ignore[arg-type]
        unity_status_pretty=pretty["uni_status"],  # type: ignore[arg-type]
        volume_by_symbol_pretty=pretty["vol_sym"],
        volume_by_symbol_side_pretty=pretty["vol_ss"],
        top_diffs_strict=top_diffs_strict,
        top_diffs_notional=top_diffs_notional,
        raw_exchange=exchange_raw if params.export_debug_sheets else None,
        raw_unity=unity_raw if params.export_debug_sheets else None,
    )

    return ReconcileResult(report_id=report_id, report_path=report_path, summary=summary)


# --- WEB helper: return preview tables for UI (limited rows) ---

def reconcile_to_report_with_preview(
    unity_xlsx_path: Path,
    exchange_path: Path,
    report_dir: Path,
    exchange_type: str = "BINANCE",
    params: Optional[ReconcileParams] = None,
    preview_limit: int = 2000,
) -> Tuple[ReconcileResult, Dict[str, List[Dict[str, Any]]]]:
    """
    Делает всё как reconcile_to_report, но дополнительно возвращает preview-таблицы для UI.
    preview_limit ограничивает размер таблиц (чтобы не грузить фронт).
    """
    result = reconcile_to_report(
        unity_xlsx_path=unity_xlsx_path,
        exchange_path=exchange_path,
        report_dir=report_dir,
        exchange_type=exchange_type,
        params=params,
    )

    wb = pd.ExcelFile(result.report_path)
    sheet_map = {
        "matches": "01_Совпадения",
        "missing": "02_Нет_в_Unity",
        "extra": "03_Лишнее_в_Unity",
        "exchange_status": f"04_Статус_{result.summary.exchange_name}",
        "unity_status": "05_Статус_Unity",
        "volume_symbol": "06_Объем_Инстр",
        "volume_symbol_side": "07_Объем_Инстр_Сторона",
    }

    preview: Dict[str, List[Dict[str, Any]]] = {}
    for key, sheet_name in sheet_map.items():
        if sheet_name not in wb.sheet_names:
            preview[key] = []
            continue
        df = wb.parse(sheet_name=sheet_name)
        if preview_limit and len(df) > preview_limit:
            df = df.head(preview_limit)
        df = df.replace({np.nan: None})
        preview[key] = df.to_dict(orient="records")

    return result, preview