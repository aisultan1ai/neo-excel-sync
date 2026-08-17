import logging
import random
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
from scipy import stats

from .universe import resolve_universe
from .features import compute_features, compute_features_for_universe
from .storage import get_conn

log = logging.getLogger(__name__)

FEATURES_TO_TEST = (
    "ret_5d", "ret_5d_pctile_60d", "cs_rank_ret_5d",
    "ret_20d", "ret_20d_pctile_60d", "cs_rank_ret_20d",
    "rsi_14", "cs_rank_rsi_14",
    "ma20_dist", "ma50_dist",
    "atr_14_pct", "vol_ratio_20", "overnight_gap",
)

MIN_SAMPLE_SIZE = 10


@dataclass
class PatternRow:
    feature: str
    n_entries: int
    n_baseline: int
    mean_entries: float | None
    mean_baseline: float | None
    ks_statistic: float | None
    p_value: float | None
    p_value_bonf: float | None
    significant: bool
    direction: str


def _trade_dates_by_ticker(side: str | None) -> list[tuple[str, str]]:
    universe = resolve_universe()
    q = """SELECT DISTINCT ticker, trade_date
           FROM trades
           WHERE ticker IN ({placeholders})""".format(
        placeholders=",".join("?" for _ in universe)
    )
    params: list = list(universe)
    if side:
        q += " AND side = ?"
        params.append(side)
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
    return [(r["ticker"], r["trade_date"]) for r in rows]


def _price_dates_by_ticker(ticker: str, from_date: str, to_date: str) -> list[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT date FROM daily_prices WHERE ticker = ? AND date BETWEEN ? AND ? ORDER BY date",
            (ticker, from_date, to_date),
        ).fetchall()
    return [r["date"] for r in rows]


def _features_at(ticker: str, as_of_date: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT payload FROM features WHERE ticker=? AND as_of_date=?",
            (ticker, as_of_date),
        ).fetchone()
    if row:
        import json
        return json.loads(row["payload"])
    f = compute_features(ticker, as_of_date)
    return f.to_dict() if f else None


def _prev_day(d: str) -> str:
    return (date.fromisoformat(d) - timedelta(days=1)).isoformat()


def warm_up_features_cache(as_of_dates: list[str]) -> None:
    unique_dates = sorted(set(as_of_dates))
    if not unique_dates:
        return
    universe = resolve_universe()
    threshold = max(1, int(len(universe) * 0.9))
    with get_conn() as conn:
        placeholders = ",".join("?" for _ in unique_dates)
        rows = conn.execute(
            f"""SELECT as_of_date, COUNT(*) AS c
                FROM features
                WHERE as_of_date IN ({placeholders})
                GROUP BY as_of_date""",
            unique_dates,
        ).fetchall()
    already_ok = {r["as_of_date"] for r in rows if r["c"] >= threshold}
    todo = [d for d in unique_dates if d not in already_ok]
    if not todo:
        log.info("pattern: warm-up фич — все %d дат уже в кэше", len(unique_dates))
        return
    log.info(
        "pattern: warm-up фич — %d/%d дат уже в кэше, считаем %d",
        len(already_ok), len(unique_dates), len(todo),
    )
    for d in todo:
        compute_features_for_universe(d)


def analyze(side: str | None = "BUY", baseline_ratio: int = 3) -> list[PatternRow]:
    entries = _trade_dates_by_ticker(side)
    if len(entries) < MIN_SAMPLE_SIZE:
        return []

    as_of_dates = [_prev_day(d) for _, d in entries]
    warm_up_features_cache(as_of_dates)

    entry_values: dict[str, list[float]] = {f: [] for f in FEATURES_TO_TEST}
    for ticker, trade_date in entries:
        payload = _features_at(ticker, _prev_day(trade_date))
        if not payload:
            continue
        for f in FEATURES_TO_TEST:
            v = payload.get(f)
            if v is not None and isinstance(v, (int, float)):
                entry_values[f].append(float(v))

    trade_ds = [d for _, d in entries]
    from_d = min(trade_ds)
    to_d = max(trade_ds)

    rng = random.Random(42)
    target_n = max(baseline_ratio * len(entries), MIN_SAMPLE_SIZE * baseline_ratio)
    baseline_samples: list[tuple[str, str]] = []
    tickers = list(resolve_universe())
    for _ in range(target_n):
        t = rng.choice(tickers)
        dates = _price_dates_by_ticker(t, from_d, to_d)
        if not dates:
            continue
        baseline_samples.append((t, rng.choice(dates)))

    warm_up_features_cache([_prev_day(d) for _, d in baseline_samples])

    baseline_values: dict[str, list[float]] = {f: [] for f in FEATURES_TO_TEST}
    for ticker, dd in baseline_samples:
        payload = _features_at(ticker, _prev_day(dd))
        if not payload:
            continue
        for f in FEATURES_TO_TEST:
            v = payload.get(f)
            if v is not None and isinstance(v, (int, float)):
                baseline_values[f].append(float(v))

    n_tests = sum(1 for f in FEATURES_TO_TEST
                  if len(entry_values[f]) >= MIN_SAMPLE_SIZE
                  and len(baseline_values[f]) >= MIN_SAMPLE_SIZE)
    n_tests = max(n_tests, 1)

    results: list[PatternRow] = []
    for f in FEATURES_TO_TEST:
        e = np.array(entry_values[f], dtype=float)
        b = np.array(baseline_values[f], dtype=float)
        if len(e) < MIN_SAMPLE_SIZE or len(b) < MIN_SAMPLE_SIZE:
            results.append(PatternRow(
                feature=f, n_entries=len(e), n_baseline=len(b),
                mean_entries=float(e.mean()) if len(e) else None,
                mean_baseline=float(b.mean()) if len(b) else None,
                ks_statistic=None, p_value=None, p_value_bonf=None,
                significant=False, direction="—",
            ))
            continue
        ks = stats.ks_2samp(e, b)
        p_bonf = min(1.0, ks.pvalue * n_tests)
        me, mb = float(e.mean()), float(b.mean())
        if abs(me - mb) < 1e-9:
            direction = "≈"
        elif me < mb:
            direction = "entries<baseline"
        else:
            direction = "entries>baseline"
        results.append(PatternRow(
            feature=f, n_entries=len(e), n_baseline=len(b),
            mean_entries=me, mean_baseline=mb,
            ks_statistic=float(ks.statistic),
            p_value=float(ks.pvalue),
            p_value_bonf=p_bonf,
            significant=(p_bonf < 0.05),
            direction=direction,
        ))
    results.sort(key=lambda r: (not r.significant, r.p_value_bonf if r.p_value_bonf is not None else 1.0))
    return results
