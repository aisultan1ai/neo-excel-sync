from __future__ import annotations

from typing import List, Optional

import pandas as pd

from .models import ReconcileParams
from .utils import _within_tol, _qround_float


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

        qty_ok = _within_tol(float(qb), float(qu), params.volume_qty_rel_tol, params.volume_qty_abs_tol)
        not_ok = _within_tol(float(nb), float(nu), params.volume_notional_rel_tol, params.volume_notional_abs_tol)
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


def _top_key_diffs(unity_n: pd.DataFrame, exchange_n: pd.DataFrame, key_col: str, limit: int = 50) -> pd.DataFrame:
    u_cnt = unity_n[key_col].value_counts()
    e_cnt = exchange_n[key_col].value_counts()
    diff = (u_cnt.subtract(e_cnt, fill_value=0)).sort_values(key=lambda s: s.abs(), ascending=False)
    out = diff.head(limit).reset_index()
    out.columns = [key_col, "unity_count_minus_exchange_count"]
    return out
