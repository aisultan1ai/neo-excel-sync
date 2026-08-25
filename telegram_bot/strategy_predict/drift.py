"""Feature drift monitoring: PSI (Population Stability Index).

Идея: сравниваем распределение фичи на исторических данных vs на свежих
(последние N дней). Если сильно разошлось — модель обучалась на «другом» рынке.

Threshold-ы (стандарт индустрии):
    PSI < 0.10  → стабильно
    0.10..0.20  → умеренный drift, стоит переобучить в ближайшее время
    PSI >= 0.20 → сильный drift, модель может быть уже не валидна
"""
import json
import logging
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np

from .ml import FEATURE_NAMES_V2_SELL, MACRO_FEATURE_NAMES
from .storage import get_conn

log = logging.getLogger(__name__)

LIVE_WINDOW_DAYS = 30
N_BINS = 10
PSI_WARN = 0.10
PSI_ALERT = 0.20


@dataclass
class FeatureDrift:
    feature: str
    psi: float | None
    n_train: int
    n_live: int
    status: str  # 'stable' | 'watch' | 'alert' | 'insufficient'


def _psi(train: np.ndarray, live: np.ndarray, n_bins: int = N_BINS) -> float | None:
    train = train[~np.isnan(train)]
    live = live[~np.isnan(live)]
    if len(train) < n_bins * 2 or len(live) < n_bins:
        return None
    edges = np.quantile(train, np.linspace(0, 1, n_bins + 1))
    edges = np.unique(edges)
    if len(edges) < 3:
        return None
    edges[0], edges[-1] = -np.inf, np.inf
    train_hist, _ = np.histogram(train, bins=edges)
    live_hist, _ = np.histogram(live, bins=edges)
    # smoothing чтобы избежать log(0)
    train_pct = (train_hist + 1) / (train_hist.sum() + len(train_hist))
    live_pct = (live_hist + 1) / (live_hist.sum() + len(live_hist))
    return float(np.sum((live_pct - train_pct) * np.log(live_pct / train_pct)))


def _load_feature_values(feature: str, from_date: str, to_date: str) -> np.ndarray:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT payload FROM features WHERE as_of_date BETWEEN ? AND ?",
            (from_date, to_date),
        ).fetchall()
    vals: list[float] = []
    for r in rows:
        payload = json.loads(r["payload"])
        v = payload.get(feature)
        if v is None:
            continue
        try:
            vals.append(float(v))
        except (TypeError, ValueError):
            continue
    return np.array(vals, dtype=float)


def _classify(psi: float | None) -> str:
    if psi is None:
        return "insufficient"
    if psi < PSI_WARN:
        return "stable"
    if psi < PSI_ALERT:
        return "watch"
    return "alert"


def compute_drift(
    feature_names: tuple[str, ...] | None = None,
    live_window_days: int = LIVE_WINDOW_DAYS,
    as_of: str | None = None,
) -> list[FeatureDrift]:
    """Считает PSI для набора фич. train = всё до окна, live = последние N дней."""
    end_d = date.fromisoformat(as_of) if as_of else date.today()
    live_start = (end_d - timedelta(days=live_window_days)).isoformat()
    train_end = (end_d - timedelta(days=live_window_days + 1)).isoformat()

    with get_conn() as conn:
        row = conn.execute("SELECT MIN(as_of_date) m FROM features").fetchone()
    train_start = row["m"] if row and row["m"] else "1970-01-01"

    if feature_names is None:
        # берём весь union — базовые + macro + position-фичи из v2/SELL
        feature_names = tuple(set(FEATURE_NAMES_V2_SELL) | set(MACRO_FEATURE_NAMES))

    out: list[FeatureDrift] = []
    for f in sorted(feature_names):
        train_vals = _load_feature_values(f, train_start, train_end)
        live_vals = _load_feature_values(f, live_start, end_d.isoformat())
        psi = _psi(train_vals, live_vals)
        out.append(FeatureDrift(
            feature=f,
            psi=psi,
            n_train=int(len(train_vals)),
            n_live=int(len(live_vals)),
            status=_classify(psi),
        ))
    return out


def has_alert(drifts: list[FeatureDrift], min_alert_features: int = 2) -> bool:
    return sum(1 for d in drifts if d.status == "alert") >= min_alert_features
