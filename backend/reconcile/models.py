from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional, Tuple


@dataclass(frozen=True)
class ReconcileParams:
    unity_utc_offset_hours: Optional[int] = 5

    okx_utc_offset_hours: Optional[int] = None
    okx_filter_trade_actions: bool = True

    okx_contract_value_overrides: Dict[str, float] = field(default_factory=dict)
    okx_contract_value_autodetect: bool = True
    okx_contract_value_snap: bool = True
    okx_contract_value_candidates: Tuple[float, ...] = (1.0, 0.1, 0.01, 0.001, 0.0001)

    bybit_utc_offset_hours: Optional[int] = 0
    bybit_filter_trade_actions: bool = True

    qty_decimals: int = 8
    price_decimals: int = 8

    enable_fuzzy: bool = True
    time_window_seconds: int = 180

    qty_rel_tol: float = 1e-6
    qty_abs_tol: float = 0.0

    price_rel_tol: float = 1e-6
    price_abs_tol: float = 0.0

    enable_notional_fallback: bool = True
    notional_decimals: int = 6
    notional_use_minute_bucket: bool = True

    enable_volume_recon: bool = True
    volume_group_by_side: bool = True

    volume_qty_rel_tol: float = 1e-6
    volume_qty_abs_tol: float = 0.0
    volume_notional_rel_tol: float = 1e-6
    volume_notional_abs_tol: float = 0.0

    binance_delimiter: Optional[str] = ";"

    export_debug_sheets: bool = False
    export_mode: str = "compact"


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
