from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np
import pandas as pd

from .models import ReconcileParams
from .utils import (
    _detect_unity_offset_hours_from_text,
    _extract_symbol_from_unity,
    _to_numeric_series,
    _qround_str,
    _snap_value,
)


def _normalize_unity(df: pd.DataFrame, params: ReconcileParams) -> Tuple[pd.DataFrame, int]:
    need_cols = ["Instrument", "Side", "Transact time", "Price"]
    for c in need_cols:
        if c not in df.columns:
            raise ValueError(f"Unity file missing required column: {c}")

    out = df.copy()
    out["symbol"] = out["Instrument"].map(_extract_symbol_from_unity)
    out["side"] = out["Side"].astype(str).str.strip().str.upper()

    qty_col = "Absolute amount" if "Absolute amount" in out.columns else ("Amount" if "Amount" in out.columns else None)
    if not qty_col:
        raise ValueError("Unity file must contain 'Absolute amount' or 'Amount'")

    out["qty"] = _to_numeric_series(out[qty_col]).abs()
    out["price"] = _to_numeric_series(out["Price"])

    offset = params.unity_utc_offset_hours
    if offset is None:
        sample = out["Transact time"].dropna().astype(str).head(20).tolist()
        offset = _detect_unity_offset_hours_from_text(sample[0], default_hours=5) if sample else 5

    tt = out["Transact time"].astype(str).str.replace(r"\s*\(UTC[^\)]*\)\s*", "", regex=True).str.strip()
    out["trade_dt_local"] = pd.to_datetime(tt, dayfirst=True, errors="coerce")
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
    action_filter: Optional[set] = None,
    contract_value_map: Optional[Dict[str, float]] = None,
    trading_unit_col: Optional[str] = None,
) -> pd.DataFrame:
    need_cols = ["Symbol", "Side", "Quantity", "Price", "Insert Time"]
    for c in need_cols:
        if c not in df.columns:
            raise ValueError(f"Exchange file missing required column: {c}. Available: {list(df.columns)}")

    out = df.copy()

    out["Symbol"] = out["Symbol"].map(symbol_mapper)
    out["Side"] = out["Side"].astype(str).str.strip().str.upper()

    qty_raw = _to_numeric_series(out["Quantity"]).abs()
    price = _to_numeric_series(out["Price"])

    if action_filter is not None:
        mask = out["Side"].isin(action_filter)
        out = out.loc[mask].copy()
        qty_raw = qty_raw.loc[mask]
        price = price.loc[mask]

    out["symbol"] = out["Symbol"].astype(str).str.strip().str.upper()
    out["side"] = out["Side"].astype(str).str.strip().str.upper()

    mult = pd.Series(1.0, index=out.index)
    if contract_value_map:
        mult = out["symbol"].map(lambda s: float(contract_value_map.get(str(s), 1.0))).astype(float)

    if trading_unit_col and trading_unit_col in out.columns:
        unit = out[trading_unit_col].astype(str).str.strip().str.lower()
        is_cont = unit.isin(["cont", "contract", "contracts"])
        out["qty"] = qty_raw * np.where(is_cont, mult, 1.0)
    else:
        out["qty"] = qty_raw * mult

    out["price"] = price

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


def _infer_okx_contract_value_map(
    unity_n: pd.DataFrame,
    okx_std: pd.DataFrame,
    symbol_mapper: Callable[[Any], str],
    action_filter: Optional[set],
    params: ReconcileParams,
) -> Dict[str, float]:

    if not params.okx_contract_value_autodetect:
        return dict(params.okx_contract_value_overrides)

    if "Quantity" not in okx_std.columns or "Symbol" not in okx_std.columns:
        return dict(params.okx_contract_value_overrides)

    tmp = okx_std.copy()
    tmp["Symbol"] = tmp["Symbol"].map(symbol_mapper)
    tmp["Side"] = tmp["Side"].astype(str).str.strip().str.upper()
    if action_filter is not None:
        tmp = tmp[tmp["Side"].isin(action_filter)].copy()

    tmp["symbol"] = tmp["Symbol"].astype(str).str.strip().str.upper()
    qty_contracts = _to_numeric_series(tmp["Quantity"]).abs()
    e_tot = qty_contracts.groupby(tmp["symbol"]).sum()

    u_tot = unity_n.groupby("symbol")["qty"].sum()

    out: Dict[str, float] = dict(params.okx_contract_value_overrides)
    for sym in (set(u_tot.index) & set(e_tot.index)):
        if sym in out:
            continue
        denom = float(e_tot.loc[sym])
        num = float(u_tot.loc[sym])
        if denom <= 0 or num <= 0:
            continue
        ratio = num / denom
        if params.okx_contract_value_snap:
            snapped = _snap_value(ratio, params.okx_contract_value_candidates, rel_tol=0.10)
            out[sym] = float(snapped if snapped is not None else ratio)
        else:
            out[sym] = float(ratio)

    return out
