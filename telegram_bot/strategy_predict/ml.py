import json
import logging
import pickle
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

import numpy as np

from .config import DEFAULT_UNIVERSE_TICKERS, MIN_RECONCILIATIONS_FOR_ML
from .features import compute_features_for_universe
from .predictor import _next_us_trading_day
from .storage import get_conn
from .universe import resolve_universe

log = logging.getLogger(__name__)

MODEL_VERSION = "xgb-1.0"

FEATURE_NAMES: tuple[str, ...] = (
    "ret_5d", "ret_20d",
    "ret_5d_pctile_60d", "ret_20d_pctile_60d",
    "rsi_14", "cs_rank_rsi_14",
    "cs_rank_ret_5d", "cs_rank_ret_20d",
    "ma20_dist", "ma50_dist",
    "atr_14_pct", "vol_ratio_20", "overnight_gap",
    "spy_ret_5d", "spy_ret_20d",
)

MIN_POSITIVE_EXAMPLES = 20


class MLNotReady(Exception):
    pass


@dataclass
class Readiness:
    n_reconciliations: int
    min_required: int
    ready: bool
    reason: str
    n_buy_positive: int
    n_sell_positive: int
    trained_buy: dict | None
    trained_sell: dict | None


def _model_path(side: str) -> str:
    from .config import DB_PATH
    return str(DB_PATH.parent / f"ml_{side.lower()}.pkl")


def _load_meta(side: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ml_models WHERE side = ?", (side,)).fetchone()
    return dict(row) if row else None


def status() -> Readiness:
    with get_conn() as conn:
        n_rec = conn.execute("SELECT COUNT(*) c FROM reconciliations").fetchone()["c"]
        n_buy = conn.execute("SELECT COUNT(*) c FROM trades WHERE side='BUY'").fetchone()["c"]
        n_sell = conn.execute("SELECT COUNT(*) c FROM trades WHERE side='SELL'").fetchone()["c"]

    ready = n_rec >= MIN_RECONCILIATIONS_FOR_ML
    reason = (
        f"OK ({n_rec} >= {MIN_RECONCILIATIONS_FOR_ML})" if ready
        else f"нужно ещё {MIN_RECONCILIATIONS_FOR_ML - n_rec} сверок "
             f"(сейчас {n_rec}/{MIN_RECONCILIATIONS_FOR_ML})"
    )
    return Readiness(
        n_reconciliations=n_rec,
        min_required=MIN_RECONCILIATIONS_FOR_ML,
        ready=ready,
        reason=reason,
        n_buy_positive=n_buy,
        n_sell_positive=n_sell,
        trained_buy=_load_meta("BUY"),
        trained_sell=_load_meta("SELL"),
    )


def _build_dataset(side: str) -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    with get_conn() as conn:
        feats = conn.execute(
            "SELECT ticker, as_of_date, payload FROM features"
        ).fetchall()
        trade_keys = conn.execute(
            "SELECT DISTINCT ticker, trade_date FROM trades WHERE side = ?",
            (side,),
        ).fetchall()

    positive = {(r["ticker"], r["trade_date"]) for r in trade_keys}

    X_rows: list[list[float]] = []
    y_rows: list[int] = []
    dates: list[str] = []
    tickers: list[str] = []

    for r in feats:
        payload = json.loads(r["payload"])
        vec: list[float] = []
        has_all = True
        for name in FEATURE_NAMES:
            v = payload.get(name)
            if v is None:
                has_all = False
                break
            vec.append(float(v))
        if not has_all:
            continue
        target_date = _next_us_trading_day(date.fromisoformat(r["as_of_date"])).isoformat()
        y = 1 if (r["ticker"], target_date) in positive else 0
        X_rows.append(vec)
        y_rows.append(y)
        dates.append(r["as_of_date"])
        tickers.append(r["ticker"])

    return np.array(X_rows, dtype=float), np.array(y_rows, dtype=int), dates, tickers


def train(side: str) -> dict:
    if side not in ("BUY", "SELL"):
        raise ValueError("side must be BUY or SELL")

    rd = status()
    if not rd.ready:
        raise MLNotReady(rd.reason)

    X, y, dates, _tickers = _build_dataset(side)
    n_positive = int(y.sum()) if len(y) else 0
    if n_positive < MIN_POSITIVE_EXAMPLES:
        raise MLNotReady(
            f"недостаточно положительных примеров для {side}: "
            f"{n_positive}/{MIN_POSITIVE_EXAMPLES}"
        )

    from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
    from sklearn.model_selection import train_test_split
    from xgboost import XGBClassifier

    order = np.argsort(dates)
    X = X[order]; y = y[order]
    split_at = int(len(X) * 0.8)
    X_train, X_test, y_train, y_test = X[:split_at], X[split_at:], y[:split_at], y[split_at:]

    if len(X_test) == 0 or y_test.sum() == 0:
        X_train, y_train = X, y
        X_test = np.empty((0, X.shape[1]))
        y_test = np.empty(0, dtype=int)

    pos_weight = max(1.0, (len(y_train) - y_train.sum()) / max(1, y_train.sum()))
    model = XGBClassifier(
        n_estimators=200,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        scale_pos_weight=pos_weight,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)

    metrics: dict[str, float | int] = {"n_train": int(len(X_train)), "n_test": int(len(X_test))}
    if len(X_test):
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]
        try:
            metrics["accuracy"] = float(accuracy_score(y_test, preds))
            metrics["f1"] = float(f1_score(y_test, preds, zero_division=0))
            if len(set(y_test)) >= 2:
                metrics["roc_auc"] = float(roc_auc_score(y_test, proba))
        except Exception:  # noqa: BLE001
            log.exception("ml: расчёт метрик упал")

    path = _model_path(side)
    with open(path, "wb") as f:
        pickle.dump({"model": model, "features": list(FEATURE_NAMES)}, f)

    from datetime import datetime, timezone
    trained_at = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO ml_models (side, trained_at, model_version, n_train, n_positive,
                                       feature_names, metrics_json, path)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(side) DO UPDATE SET
                   trained_at=excluded.trained_at,
                   model_version=excluded.model_version,
                   n_train=excluded.n_train,
                   n_positive=excluded.n_positive,
                   feature_names=excluded.feature_names,
                   metrics_json=excluded.metrics_json,
                   path=excluded.path""",
            (side, trained_at, MODEL_VERSION, int(len(X_train)), n_positive,
             json.dumps(list(FEATURE_NAMES)), json.dumps(metrics), path),
        )

    log.info("ml: %s обучен на n_train=%d n_pos=%d metrics=%s",
             side, len(X_train), n_positive, metrics)
    return {
        "side": side,
        "trained_at": trained_at,
        "model_version": MODEL_VERSION,
        "n_train": int(len(X_train)),
        "n_positive": n_positive,
        "metrics": metrics,
    }


def _load_model(side: str):
    meta = _load_meta(side)
    if not meta:
        raise MLNotReady(f"модель для {side} ещё не обучена — запусти /train_ml")
    with open(meta["path"], "rb") as f:
        bundle = pickle.load(f)
    return bundle["model"], bundle["features"], meta


def predict_ml(target_date: str | None = None, top_n: int = 5) -> dict:
    if target_date is None:
        target_date = _next_us_trading_day(date.today()).isoformat()
    as_of = (date.fromisoformat(target_date) - timedelta(days=1)).isoformat()

    universe = resolve_universe()
    features = compute_features_for_universe(as_of, tickers=universe)
    if not features:
        return {"target_date": target_date, "as_of_date": as_of, "buy": [], "sell": [],
                "note": "нет фич на дату"}

    def _rank(side: str) -> list[dict]:
        try:
            model, feature_names, meta = _load_model(side)
        except MLNotReady:
            return []
        rows: list[tuple[str, list[float]]] = []
        for t, f in features.items():
            payload = f.to_dict()
            vec = []
            skip = False
            for name in feature_names:
                v = payload.get(name)
                if v is None:
                    skip = True; break
                vec.append(float(v))
            if not skip:
                rows.append((t, vec))
        if not rows:
            return []
        X = np.array([v for _, v in rows], dtype=float)
        proba = model.predict_proba(X)[:, 1]
        ranked = sorted(zip([t for t, _ in rows], proba), key=lambda kv: -kv[1])
        return [
            {"rank": i + 1, "ticker": t, "confidence": float(p),
             "side": side}
            for i, (t, p) in enumerate(ranked[:top_n])
        ]

    return {
        "target_date": target_date,
        "as_of_date": as_of,
        "model_version": MODEL_VERSION,
        "n_universe": len(features),
        "buy": _rank("BUY"),
        "sell": _rank("SELL"),
    }


def why_ml(ticker: str, target_date: str | None = None, top_n: int = 5) -> dict:
    import shap

    if target_date is None:
        target_date = _next_us_trading_day(date.today()).isoformat()
    as_of = (date.fromisoformat(target_date) - timedelta(days=1)).isoformat()

    features = compute_features_for_universe(as_of)
    f = features.get(ticker)
    if f is None:
        return {"error": f"нет фич для {ticker} на {as_of}"}
    payload = f.to_dict()

    out: dict = {"ticker": ticker, "target_date": target_date, "as_of_date": as_of, "sides": {}}
    for side in ("BUY", "SELL"):
        try:
            model, feature_names, meta = _load_model(side)
        except MLNotReady as e:
            out["sides"][side] = {"error": str(e)}
            continue
        vec = []
        skip = False
        for name in feature_names:
            v = payload.get(name)
            if v is None:
                skip = True; break
            vec.append(float(v))
        if skip:
            out["sides"][side] = {"error": "нет полного вектора фич"}
            continue
        X = np.array([vec], dtype=float)
        proba = float(model.predict_proba(X)[0, 1])

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X)
        contribs = list(zip(feature_names, shap_values[0].tolist(), vec))
        contribs.sort(key=lambda x: -abs(x[1]))
        out["sides"][side] = {
            "probability": proba,
            "top_features": [
                {"name": n, "value": v, "shap": s}
                for n, s, v in contribs[:top_n]
            ],
        }
    return out
