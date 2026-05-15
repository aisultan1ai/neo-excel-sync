from __future__ import annotations

from typing import Any, Optional

import numpy as np
import pandas as pd

from .utils import _pick_col, _pick_col_optional


def _prepare_okx_to_standard(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [str(c).replace("﻿", "").strip() for c in out.columns]

    col_time = _pick_col(out, ["Time", "Trade Time", "Fill Time", "Timestamp"], "Insert Time(Time)")
    col_symbol = _pick_col(out, ["Symbol", "Instrument", "Inst", "Trading Pair", "Currency Pair"], "Symbol")
    col_side = _pick_col(out, ["Action", "Side", "Direction"], "Side")
    col_qty = _pick_col(out, ["Amount", "Quantity", "Size", "Filled Amount", "Qty"], "Quantity")
    col_price = _pick_col(out, ["Filled Price", "Price", "Fill Price", "Avg Price"], "Price")

    col_trade_id = _pick_col_optional(out, ["id", "Trade ID", "Fill ID", "trade id", "﻿id"])
    col_order_id = _pick_col_optional(out, ["Order id", "Order ID", "order id"])
    col_fee = _pick_col_optional(out, ["Fee", "Trading Fee", "Commission"])
    col_fee_unit = _pick_col_optional(out, ["Fee Unit", "Commission Asset", "Fee Currency", "Fee Coin"])
    col_unit = _pick_col_optional(out, ["Trading Unit", "Unit"])

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
    if col_unit:
        std["Trading Unit"] = out[col_unit]

    return std


def _prepare_binance_to_standard(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [str(c).replace("﻿", "").strip() for c in out.columns]

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

    col_trade_id = _pick_col_optional(out, ["Trade ID", "TradeId", "ID", "id"])
    col_order_id = _pick_col_optional(out, ["Order ID", "OrderId", "Order id", "Order No.", "Order No"])
    col_fee = _pick_col_optional(out, ["Fee", "Commission", "Trading Fee"])
    col_fee_asset = _pick_col_optional(out, ["Commission Asset", "Fee Unit", "Fee Asset", "Commission Coin"])

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
    if col_fee_asset:
        std["Commission Asset"] = out[col_fee_asset]

    return std


def _map_bybit_side(v: Any) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    s = str(v).strip().upper()

    if s in {"BUY", "B"}:
        return "BUY"
    if s in {"SELL", "S"}:
        return "SELL"

    if s == "LONG":
        return "BUY"
    if s == "SHORT":
        return "SELL"

    if "CLOSE" in s and "LONG" in s:
        return "SELL"
    if "CLOSE" in s and "SHORT" in s:
        return "BUY"

    if "BUY" in s:
        return "BUY"
    if "SELL" in s:
        return "SELL"
    if "LONG" in s:
        return "BUY"
    if "SHORT" in s:
        return "SELL"
    return s


def _prepare_bybit_to_standard(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [str(c).replace("﻿", "").strip() for c in out.columns]

    col_time = _pick_col(
        out,
        [
            "Transaction Time(UTC+0)",
            "Transaction Time (UTC+0)",
            "Transaction Time",
            "Time",
            "Date(UTC)",
            "Date (UTC)",
        ],
        "Insert Time",
    )

    col_symbol = _pick_col(out, ["Market", "Symbol", "Pair", "Instrument"], "Symbol")
    col_side = _pick_col(out, ["Direction", "Side", "Action"], "Side")
    col_qty = _pick_col(out, ["Filled Quantity", "Qty", "Quantity", "Executed", "Amount", "Size"], "Quantity")
    col_price = _pick_col(out, ["Filled Price", "Price", "Avg Price", "Executed Price"], "Price")

    col_trade_id = _pick_col_optional(out, ["Transaction ID", "Trasaction ID", "Trade ID", "Exec ID", "Fill ID", "ID", "id"])
    col_order_id = _pick_col_optional(out, ["Order No.", "Order No", "Order ID", "OrderId", "Order id"])
    col_fee = _pick_col_optional(out, ["Trading Fee", "Fee", "Commission", "ExecFeeV2", "Exec Fee", "ExecFee"])
    col_fee_asset = _pick_col_optional(out, ["feeCoin", "Fee Coin", "Commission Asset", "Fee Unit", "Fee Asset"])

    std = pd.DataFrame()
    std["Insert Time"] = out[col_time]
    std["Symbol"] = out[col_symbol]
    std["Side"] = out[col_side].map(_map_bybit_side)
    std["Quantity"] = out[col_qty]
    std["Price"] = out[col_price]

    if col_trade_id:
        std["Trade ID"] = out[col_trade_id]
    if col_order_id:
        std["Order ID"] = out[col_order_id]
    if col_fee:
        std["Fee"] = out[col_fee]
    if col_fee_asset:
        std["Commission Asset"] = out[col_fee_asset]

    return std
