from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .models import ReconcileParams, ReconcileSummary, ReconcileResult
from .utils import _qround_float, _qround_str, _extract_symbol_basic, _extract_symbol_from_okx
from .readers import _read_binance_file, _read_bybit_file, _read_okx_xlsx
from .parsers import _prepare_binance_to_standard, _prepare_bybit_to_standard, _prepare_okx_to_standard
from .normalizers import _normalize_unity, _normalize_exchange_common, _infer_okx_contract_value_map
from .matcher import _reconcile_multiset_by_key, _reconcile_fuzzy
from .volume import _agg_volume, _compare_volume, _top_key_diffs
from .reporter import _build_pretty_tables, _export_report_xlsx


def _reconcile_core(
    unity_xlsx_path: Path,
    exchange_path: Path,
    exchange_type: str,
    params: ReconcileParams,
) -> Tuple[str, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, Optional[Dict[str, float]], int]:
    exchange_type = exchange_type.upper().strip()
    if exchange_type not in {"BINANCE", "OKX", "BYBIT"}:
        raise ValueError(f"Unsupported exchange_type: {exchange_type}")

    unity_raw = pd.read_excel(unity_xlsx_path)

    exchange_offset = 0
    symbol_mapper: Callable[[Any], str] = lambda x: str(x).upper().strip() if x is not None else ""
    action_filter: Optional[set] = None
    contract_map: Optional[Dict[str, float]] = None
    trading_unit_col: Optional[str] = None

    if exchange_type == "BINANCE":
        exchange_raw0 = _read_binance_file(exchange_path, params.binance_delimiter)
        exchange_raw = _prepare_binance_to_standard(exchange_raw0)

        exchange_name = "Binance"
        exchange_offset = 0
        symbol_mapper = _extract_symbol_basic
        action_filter = {"BUY", "SELL"}

    elif exchange_type == "BYBIT":
        exchange_raw0 = _read_bybit_file(exchange_path)
        exchange_raw = _prepare_bybit_to_standard(exchange_raw0)

        exchange_name = "Bybit"
        exchange_offset = int(params.bybit_utc_offset_hours or 0)
        symbol_mapper = _extract_symbol_basic
        action_filter = {"BUY", "SELL"} if params.bybit_filter_trade_actions else None

    else:
        okx_df, tz = _read_okx_xlsx(exchange_path)
        exchange_raw = _prepare_okx_to_standard(okx_df)

        exchange_name = "OKX"
        detected = tz
        exchange_offset = int(params.okx_utc_offset_hours) if params.okx_utc_offset_hours is not None else (int(detected) if detected is not None else 0)
        symbol_mapper = _extract_symbol_from_okx
        action_filter = {"BUY", "SELL"} if params.okx_filter_trade_actions else None

        unity_n, used_unity_offset = _normalize_unity(unity_raw, params)
        contract_map = _infer_okx_contract_value_map(unity_n, exchange_raw, symbol_mapper, action_filter, params)
        trading_unit_col = "Trading Unit" if "Trading Unit" in exchange_raw.columns else None

        exchange_n = _normalize_exchange_common(
            exchange_raw,
            params,
            time_offset_hours=exchange_offset,
            symbol_mapper=symbol_mapper,
            action_filter=action_filter,
            contract_value_map=contract_map,
            trading_unit_col=trading_unit_col,
        )
        return exchange_name, unity_raw, exchange_raw, unity_n, exchange_n, contract_map, used_unity_offset

    unity_n, used_unity_offset = _normalize_unity(unity_raw, params)

    if exchange_type == "BYBIT":
        unity_n["qty"] = unity_n["qty"] * 100
        unity_n["qty_r"] = unity_n["qty"].map(lambda x: _qround_str(x, params.qty_decimals))
        unity_n["notional"] = unity_n["qty"] * unity_n["price"]
        unity_n["notional_r"] = unity_n["notional"].map(lambda x: _qround_str(x, params.notional_decimals))

        unity_n["match_key"] = (
            unity_n["symbol"].astype(str) + "|" +
            unity_n["side"].astype(str) + "|" +
            unity_n["qty_r"].astype(str) + "|" +
            unity_n["price_r"].astype(str)
        )

        if params.notional_use_minute_bucket:
            unity_n["notional_key"] = (
                unity_n["symbol"].astype(str) + "|" +
                unity_n["side"].astype(str) + "|" +
                unity_n["minute_utc"].astype(str) + "|" +
                unity_n["notional_r"].astype(str)
            )
        else:
            unity_n["notional_key"] = (
                unity_n["symbol"].astype(str) + "|" +
                unity_n["side"].astype(str) + "|" +
                unity_n["notional_r"].astype(str)
            )

    exchange_n = _normalize_exchange_common(
        exchange_raw,
        params,
        time_offset_hours=exchange_offset,
        symbol_mapper=symbol_mapper,
        action_filter=action_filter,
        contract_value_map=None,
        trading_unit_col=None,
    )
    return exchange_name, unity_raw, exchange_raw, unity_n, exchange_n, None, used_unity_offset


def _run_reconcile(
    unity_xlsx_path: Path,
    exchange_path: Path,
    report_dir: Path,
    exchange_type: str,
    params: ReconcileParams,
) -> Tuple[ReconcileResult, Optional[Dict[str, List[Dict[str, Any]]]]]:
    exchange_name, unity_raw, exchange_raw, unity_n, exchange_n, contract_map, used_unity_offset = _reconcile_core(
        unity_xlsx_path=unity_xlsx_path,
        exchange_path=exchange_path,
        exchange_type=exchange_type,
        params=params,
    )

    matched_strict, missing_in_unity, extra_in_unity = _reconcile_multiset_by_key(unity_n, exchange_n, "match_key")

    matched_fuzzy = pd.DataFrame(columns=["exchange_idx", "unity_idx", "score"])
    if params.enable_fuzzy:
        matched_fuzzy, missing_in_unity, extra_in_unity = _reconcile_fuzzy(missing_in_unity, extra_in_unity, params)

    matched_notional = pd.DataFrame(columns=["exchange_idx", "unity_idx", "key"])
    if params.enable_notional_fallback:
        matched_notional, missing_in_unity, extra_in_unity = _reconcile_multiset_by_key(extra_in_unity, missing_in_unity, "notional_key")

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

    ex_status = exchange_n.copy()
    ex_status["status"] = "НЕТ_В_UNITY"
    ex_status["matched_unity_idx"] = np.nan

    uni_status = unity_n.copy()
    uni_status["status"] = "ЛИШНЕЕ_В_UNITY"
    uni_status["matched_exchange_idx"] = np.nan

    def _apply_matches(mdf: pd.DataFrame, label: str) -> None:
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
                f"Unity UTC offset: {used_unity_offset}"
            )

    if contract_map:
        warning = (warning + " | " if warning else "") + f"OKX contracts→base: {contract_map}"

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
        matched_fuzzy=int(len(matched_fuzzy)),
        matched_notional=int(len(matched_notional)),
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
        matched_pretty=pretty["matched"],
        missing_pretty=pretty["missing"],
        extra_pretty=pretty["extra"],
        ex_status_pretty=pretty["ex_status"],
        unity_status_pretty=pretty["uni_status"],
        volume_by_symbol_pretty=pretty["vol_sym"],
        volume_by_symbol_side_pretty=pretty["vol_ss"],
        top_diffs_strict=top_diffs_strict,
        top_diffs_notional=top_diffs_notional,
        raw_exchange=exchange_raw if params.export_debug_sheets else None,
        raw_unity=unity_raw if params.export_debug_sheets else None,
    )

    return ReconcileResult(report_id=report_id, report_path=report_path, summary=summary), pretty


def reconcile_to_report(
    unity_xlsx_path: Path,
    exchange_path: Path,
    report_dir: Path,
    exchange_type: str = "BINANCE",
    params: Optional[ReconcileParams] = None,
) -> ReconcileResult:
    params = params or ReconcileParams()
    result, _ = _run_reconcile(unity_xlsx_path, exchange_path, report_dir, exchange_type, params)
    return result


def reconcile_to_report_with_preview(
    unity_xlsx_path: Path,
    exchange_path: Path,
    report_dir: Path,
    exchange_type: str = "BINANCE",
    params: Optional[ReconcileParams] = None,
    preview_limit: int = 2000,
) -> Tuple[ReconcileResult, Dict[str, List[Dict[str, Any]]]]:
    params = params or ReconcileParams()
    result, pretty = _run_reconcile(unity_xlsx_path, exchange_path, report_dir, exchange_type, params)

    def _preview_df(df: Optional[pd.DataFrame]) -> List[Dict[str, Any]]:
        if df is None:
            return []
        d = df.copy()
        if preview_limit and len(d) > preview_limit:
            d = d.head(preview_limit)
        d = d.replace({np.nan: None})
        return d.to_dict(orient="records")

    preview: Dict[str, List[Dict[str, Any]]] = {
        "matches": _preview_df(pretty["matched"]),
        "missing": _preview_df(pretty["missing"]),
        "extra": _preview_df(pretty["extra"]),
        "exchange_status": _preview_df(pretty["ex_status"]),
        "unity_status": _preview_df(pretty["uni_status"]),
        "volume_symbol": _preview_df(pretty["vol_sym"]),
        "volume_symbol_side": _preview_df(pretty["vol_ss"]),
    }

    return result, preview
