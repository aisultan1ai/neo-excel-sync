from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

from .models import ReconcileParams
from .utils import _within_tol


def _group_indices_sorted(df: pd.DataFrame, key_col: str) -> Dict[Any, List[int]]:
    if df.empty:
        return {}
    df_sorted = df.sort_values("trade_dt_utc", kind="mergesort")
    idx_map = df_sorted.groupby(key_col, sort=False).indices
    res: Dict[Any, List[int]] = {}
    idx_values = df_sorted.index.to_numpy()
    for k, pos in idx_map.items():
        res[k] = idx_values[pos].tolist()
    return res


def _reconcile_multiset_by_key(
    unity_n: pd.DataFrame,
    exchange_n: pd.DataFrame,
    key_col: str,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:

    u_groups = _group_indices_sorted(unity_n, key_col)
    e_groups = _group_indices_sorted(exchange_n, key_col)

    matched: List[Tuple[int, int, str]] = []
    missing_ex: List[int] = []
    extra_unity: List[int] = []

    for k, e_idxs in e_groups.items():
        u_idxs = u_groups.get(k, [])
        n = min(len(e_idxs), len(u_idxs))
        for i in range(n):
            matched.append((int(e_idxs[i]), int(u_idxs[i]), str(k)))
        if len(e_idxs) > n:
            missing_ex.extend([int(x) for x in e_idxs[n:]])
        if len(u_idxs) > n:
            extra_unity.extend([int(x) for x in u_idxs[n:]])

    for k, u_idxs in u_groups.items():
        if k not in e_groups:
            extra_unity.extend([int(x) for x in u_idxs])

    matched_df = pd.DataFrame(matched, columns=["exchange_idx", "unity_idx", "key"])
    missing_df = exchange_n.loc[missing_ex].copy()
    extra_df = unity_n.loc[extra_unity].copy()
    return matched_df, missing_df, extra_df


def _reconcile_fuzzy(
    missing_exchange: pd.DataFrame,
    extra_unity: pd.DataFrame,
    params: ReconcileParams,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:

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
        groups[str(grp)] = (times, ids)

    used_unity: Set[int] = set()
    matched_rows: List[Dict[str, Any]] = []

    for _, brow in b.iterrows():
        grp = str(brow["grp"])
        if grp not in groups:
            continue

        bt = brow["trade_dt_utc"]
        if pd.isna(bt):
            continue

        b_qty = float(brow["qty"]) if not pd.isna(brow["qty"]) else np.nan
        b_price = float(brow["price"]) if not pd.isna(brow["price"]) else np.nan
        if pd.isna(b_qty) or pd.isna(b_price):
            continue

        b_time = np.datetime64(bt.to_datetime64())
        times_u, ids_u = groups[grp]

        left = np.searchsorted(times_u, b_time - np.timedelta64(win_ns, "ns"), side="left")
        right = np.searchsorted(times_u, b_time + np.timedelta64(win_ns, "ns"), side="right")
        if left >= right:
            continue

        best_score = None
        best_uid: Optional[int] = None

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

        if best_uid is not None and best_score is not None:
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
