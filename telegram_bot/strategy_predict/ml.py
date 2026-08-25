import json
import logging
import os
import pickle
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Iterable

import numpy as np

from .config import DEFAULT_UNIVERSE_TICKERS, MIN_RECONCILIATIONS_FOR_ML
from .features import compute_features_for_universe
from .predictor import _next_us_trading_day
from .storage import get_conn
from .universe import resolve_universe

log = logging.getLogger(__name__)

MODEL_VERSION = "xgb-1.0"
MODEL_VERSION_V2 = "xgb-2.0"
MODEL_VERSION_META = "meta-1.0"
MODEL_VERSION_ENSEMBLE = "ens-1.0"

META_UPSTREAM_RULE = "mrv-1.0"

FEATURE_NAMES: tuple[str, ...] = (
    "ret_5d", "ret_20d",
    "ret_5d_pctile_60d", "ret_20d_pctile_60d",
    "rsi_14", "cs_rank_rsi_14",
    "cs_rank_ret_5d", "cs_rank_ret_20d",
    "ma20_dist", "ma50_dist",
    "atr_14_pct", "vol_ratio_20", "overnight_gap",
    "spy_ret_5d", "spy_ret_20d",
)

POSITION_FEATURE_NAMES: tuple[str, ...] = (
    "days_in_position",
    "unrealized_pnl_pct",
    "max_dd_in_position",
)

MACRO_FEATURE_NAMES: tuple[str, ...] = (
    "dollar_vol_20d",
    "vix_level",
    "vix_change_5d",
    "dxy_change_5d",
    "yield_10y_level",
    "yield_10y_change_5d",
    "class_relative_ret_5d",
    "class_relative_ret_20d",
)

# v2 добавляет macro-фичи всем моделям и position-фичи только SELL
FEATURE_NAMES_V2_BUY: tuple[str, ...] = FEATURE_NAMES + MACRO_FEATURE_NAMES
FEATURE_NAMES_V2_SELL: tuple[str, ...] = FEATURE_NAMES + MACRO_FEATURE_NAMES + POSITION_FEATURE_NAMES

# meta модель: базовые фичи + скор первичного сигнала mrv-1.0
FEATURE_NAMES_META: tuple[str, ...] = FEATURE_NAMES + ("mrv_confidence",)


def _feature_names_for(side: str, model_version: str) -> tuple[str, ...]:
    if model_version == MODEL_VERSION_V2:
        return FEATURE_NAMES_V2_SELL if side == "SELL" else FEATURE_NAMES_V2_BUY
    if model_version == MODEL_VERSION_META:
        return FEATURE_NAMES_META
    return FEATURE_NAMES


def _row_eligible(side: str, model_version: str, payload: dict) -> bool:
    """v2/SELL обучается/предсказывает только по строкам с открытой позицией."""
    if model_version == MODEL_VERSION_V2 and side == "SELL":
        return payload.get("days_in_position") is not None
    return True


def _is_meta(model_version: str) -> bool:
    return model_version == MODEL_VERSION_META

MIN_POSITIVE_EXAMPLES = 20

CV_N_SPLITS = 5
CV_EMBARGO_DAYS = 2
PROD_TOP_K = 5

DEFAULT_XGB_PARAMS: dict[str, Any] = {
    "n_estimators": 200,
    "max_depth": 3,
    "learning_rate": 0.05,
    "subsample": 0.9,
    "colsample_bytree": 0.9,
}

OPTUNA_N_TRIALS = 30
OPTUNA_TIMEOUT_SEC = 300

# sample weights по свежести: weight = SAMPLE_WEIGHT_DECAY^(age_days)
SAMPLE_WEIGHT_DECAY = 0.995


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


def _model_path(side: str, model_version: str = MODEL_VERSION) -> str:
    from .config import DB_PATH
    # legacy path для xgb-1.0 сохраняется
    if model_version == MODEL_VERSION:
        return str(DB_PATH.parent / f"ml_{side.lower()}.pkl")
    suffix = model_version.replace(".", "_").replace("-", "_")
    return str(DB_PATH.parent / f"ml_{side.lower()}_{suffix}.pkl")


def _load_meta(side: str, model_version: str | None = None) -> dict | None:
    with get_conn() as conn:
        if model_version:
            row = conn.execute(
                "SELECT * FROM ml_models WHERE side = ? AND model_version = ?",
                (side, model_version),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM ml_models WHERE side = ? "
                "ORDER BY trained_at DESC LIMIT 1",
                (side,),
            ).fetchone()
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


def _build_dataset(
    side: str, model_version: str = MODEL_VERSION
) -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    feature_names = _feature_names_for(side, model_version)
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
        if not _row_eligible(side, model_version, payload):
            continue
        vec: list[float] = []
        has_all = True
        for name in feature_names:
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


def _build_meta_dataset(
    side: str,
) -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    """Датасет для мета-модели: только строки, где mrv-1.0 выдал сигнал (side).
    Признаки = базовые фичи + mrv_confidence. Метка = 1 если сделка была."""
    feature_names = _feature_names_for(side, MODEL_VERSION_META)
    with get_conn() as conn:
        preds = conn.execute(
            """SELECT target_date, ticker, confidence
               FROM predictions
               WHERE rule_version = ? AND side = ?""",
            (META_UPSTREAM_RULE, side),
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

    with get_conn() as conn:
        for p in preds:
            target_date = p["target_date"]
            as_of_hint = (
                date.fromisoformat(target_date) - timedelta(days=1)
            ).isoformat()
            # ищем ближайший as_of ≤ target_date-1 (features хранят prev_trading_day)
            row = conn.execute(
                """SELECT as_of_date, payload FROM features
                   WHERE ticker = ? AND as_of_date <= ?
                   ORDER BY as_of_date DESC LIMIT 1""",
                (p["ticker"], as_of_hint),
            ).fetchone()
            if not row:
                continue
            payload = json.loads(row["payload"])
            payload["mrv_confidence"] = float(p["confidence"])
            vec: list[float] = []
            has_all = True
            for name in feature_names:
                v = payload.get(name)
                if v is None:
                    has_all = False; break
                vec.append(float(v))
            if not has_all:
                continue
            y = 1 if (p["ticker"], target_date) in positive else 0
            X_rows.append(vec)
            y_rows.append(y)
            dates.append(row["as_of_date"])
            tickers.append(p["ticker"])

    return np.array(X_rows, dtype=float), np.array(y_rows, dtype=int), dates, tickers


def _make_xgb(pos_weight: float, params: dict[str, Any] | None = None):
    from xgboost import XGBClassifier
    p = {**DEFAULT_XGB_PARAMS, **(params or {})}
    return XGBClassifier(
        **p,
        scale_pos_weight=pos_weight,
        eval_metric="logloss",
        random_state=42,
    )


def _recency_weights(dates_arr: np.ndarray, decay: float = SAMPLE_WEIGHT_DECAY) -> np.ndarray:
    """weight_i = decay^(age_i), где age_i = дни от max(date) до date_i.
    Свежие строки → weight ~1.0, старые → быстро затухают."""
    parsed = np.array([date.fromisoformat(str(d)) for d in dates_arr])
    max_d = parsed.max()
    ages = np.array([(max_d - d).days for d in parsed], dtype=float)
    return np.power(decay, ages)


def _tune_hyperparams_optuna(
    X: np.ndarray, y: np.ndarray, dates_arr: np.ndarray,
    n_trials: int = OPTUNA_N_TRIALS,
    timeout: int = OPTUNA_TIMEOUT_SEC,
) -> dict[str, Any] | None:
    try:
        import optuna
    except ImportError:
        log.warning("ml: optuna не установлена — tuning пропущен")
        return None
    from sklearn.model_selection import TimeSeriesSplit

    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def _eval_fold(train_idx, test_idx, params) -> float | None:
        min_test = date.fromisoformat(str(dates_arr[test_idx].min()))
        cut = (min_test - timedelta(days=CV_EMBARGO_DAYS)).isoformat()
        train_idx = train_idx[dates_arr[train_idx] < cut]
        if len(train_idx) < 50 or int(y[train_idx].sum()) < 5:
            return None
        if int(y[test_idx].sum()) == 0:
            return None
        pw = max(1.0, (len(y[train_idx]) - y[train_idx].sum()) / max(1, int(y[train_idx].sum())))
        m = _make_xgb(pw, params)
        sw = _recency_weights(dates_arr[train_idx])
        m.fit(X[train_idx], y[train_idx], sample_weight=sw)
        proba = m.predict_proba(X[test_idx])[:, 1]
        return _precision_at_k_per_day(dates_arr[test_idx], y[test_idx], proba, k=PROD_TOP_K)

    def objective(trial: "optuna.trial.Trial") -> float:
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 100, 400, step=50),
            "max_depth": trial.suggest_int("max_depth", 2, 6),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
        }
        tscv = TimeSeriesSplit(n_splits=CV_N_SPLITS)
        scores: list[float] = []
        for train_idx, test_idx in tscv.split(X):
            s = _eval_fold(train_idx, test_idx, params)
            if s is not None:
                scores.append(s)
        return float(np.mean(scores)) if scores else 0.0

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=42),
    )
    study.optimize(objective, n_trials=n_trials, timeout=timeout, show_progress_bar=False)
    return dict(study.best_params)


def _tuning_enabled() -> bool:
    return os.environ.get("ML_TUNE_HYPERPARAMS", "0").strip() in ("1", "true", "True", "yes")


def _precision_at_k_per_day(
    dates_arr: np.ndarray, y_true: np.ndarray, proba: np.ndarray, k: int
) -> float | None:
    by_day: dict[str, list[tuple[float, int]]] = defaultdict(list)
    for d, y_val, p_val in zip(dates_arr, y_true, proba):
        by_day[str(d)].append((float(p_val), int(y_val)))
    precisions: list[float] = []
    for rows in by_day.values():
        rows.sort(key=lambda x: -x[0])
        top = rows[:k]
        if not top:
            continue
        precisions.append(sum(y for _, y in top) / len(top))
    if not precisions:
        return None
    return float(np.mean(precisions))


def train(side: str, model_version: str = MODEL_VERSION) -> dict:
    if side not in ("BUY", "SELL"):
        raise ValueError("side must be BUY or SELL")

    rd = status()
    if not rd.ready:
        raise MLNotReady(rd.reason)

    feature_names = _feature_names_for(side, model_version)
    if _is_meta(model_version):
        X, y, dates, _tickers = _build_meta_dataset(side)
    else:
        X, y, dates, _tickers = _build_dataset(side, model_version)
    n_positive = int(y.sum()) if len(y) else 0
    if n_positive < MIN_POSITIVE_EXAMPLES:
        raise MLNotReady(
            f"недостаточно положительных примеров для {side} ({model_version}): "
            f"{n_positive}/{MIN_POSITIVE_EXAMPLES}"
        )

    from sklearn.metrics import (
        accuracy_score,
        average_precision_score,
        f1_score,
        roc_auc_score,
    )
    from sklearn.model_selection import TimeSeriesSplit

    order = np.argsort(dates)
    X = X[order]; y = y[order]
    dates_arr = np.array([dates[i] for i in order])

    tuned_params: dict[str, Any] | None = None
    if _tuning_enabled():
        log.info("ml: %s (%s) Optuna tuning (n_trials=%d, timeout=%ds)",
                 side, model_version, OPTUNA_N_TRIALS, OPTUNA_TIMEOUT_SEC)
        try:
            tuned_params = _tune_hyperparams_optuna(X, y, dates_arr)
            log.info("ml: %s (%s) best_params=%s", side, model_version, tuned_params)
        except Exception:  # noqa: BLE001
            log.exception("ml: Optuna упала — использую default params")
            tuned_params = None

    tscv = TimeSeriesSplit(n_splits=CV_N_SPLITS)
    fold_metrics: list[dict] = []

    for fold_idx, (train_idx, test_idx) in enumerate(tscv.split(X)):
        min_test_date = date.fromisoformat(str(dates_arr[test_idx].min()))
        embargo_cutoff = (min_test_date - timedelta(days=CV_EMBARGO_DAYS)).isoformat()
        train_idx = train_idx[dates_arr[train_idx] < embargo_cutoff]

        if len(train_idx) < 50 or int(y[train_idx].sum()) < 5:
            log.info("ml: %s fold %d пропущен (мало train)", side, fold_idx)
            continue
        if int(y[test_idx].sum()) == 0:
            log.info("ml: %s fold %d пропущен (нет positive в test)", side, fold_idx)
            continue

        X_tr, y_tr = X[train_idx], y[train_idx]
        X_te, y_te = X[test_idx], y[test_idx]
        dates_te = dates_arr[test_idx]

        pos_weight = max(1.0, (len(y_tr) - y_tr.sum()) / max(1, int(y_tr.sum())))
        model = _make_xgb(pos_weight, tuned_params)
        sw_tr = _recency_weights(dates_arr[train_idx])
        model.fit(X_tr, y_tr, sample_weight=sw_tr)

        proba = model.predict_proba(X_te)[:, 1]
        preds = (proba >= 0.5).astype(int)

        fm: dict[str, float | int | None] = {
            "fold": fold_idx,
            "n_train": int(len(X_tr)),
            "n_test": int(len(X_te)),
            "n_pos_test": int(y_te.sum()),
            "accuracy": float(accuracy_score(y_te, preds)),
            "f1": float(f1_score(y_te, preds, zero_division=0)),
        }
        if len(set(y_te.tolist())) >= 2:
            fm["roc_auc"] = float(roc_auc_score(y_te, proba))
            fm["pr_auc"] = float(average_precision_score(y_te, proba))
        fm["precision_at_k"] = _precision_at_k_per_day(dates_te, y_te, proba, k=PROD_TOP_K)
        fold_metrics.append(fm)

    def _agg(key: str) -> tuple[float | None, float | None]:
        vals = [fm[key] for fm in fold_metrics if fm.get(key) is not None]
        if not vals:
            return None, None
        return float(np.mean(vals)), float(np.std(vals))

    metrics: dict[str, float | int | None] = {
        "n_train": int(len(X)),
        "n_test": 0,
        "n_folds": len(fold_metrics),
        "cv_embargo_days": CV_EMBARGO_DAYS,
        "top_k": PROD_TOP_K,
    }
    for key in ("accuracy", "f1", "roc_auc", "pr_auc", "precision_at_k"):
        mean_val, std_val = _agg(key)
        if mean_val is not None:
            metrics[f"{key}_mean"] = round(mean_val, 4)
            metrics[f"{key}_std"] = round(std_val, 4)
    # backwards-compat: старые ключи accuracy/f1/roc_auc — это средние по фолдам
    for key in ("accuracy", "f1", "roc_auc"):
        if f"{key}_mean" in metrics:
            metrics[key] = metrics[f"{key}_mean"]

    pos_weight_final = max(1.0, (len(y) - y.sum()) / max(1, int(y.sum())))
    model = _make_xgb(pos_weight_final, tuned_params)
    sw_all = _recency_weights(dates_arr)
    model.fit(X, y, sample_weight=sw_all)
    if tuned_params:
        metrics["best_params"] = tuned_params

    path = _model_path(side, model_version)
    with open(path, "wb") as f:
        pickle.dump({"model": model, "features": list(feature_names)}, f)

    from datetime import datetime, timezone
    trained_at = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO ml_models (side, model_version, trained_at, n_train, n_positive,
                                       feature_names, metrics_json, path)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(side, model_version) DO UPDATE SET
                   trained_at=excluded.trained_at,
                   n_train=excluded.n_train,
                   n_positive=excluded.n_positive,
                   feature_names=excluded.feature_names,
                   metrics_json=excluded.metrics_json,
                   path=excluded.path""",
            (side, model_version, trained_at, int(len(X)), n_positive,
             json.dumps(list(feature_names)), json.dumps(metrics), path),
        )

    log.info("ml: %s (%s) обучен на n_train=%d n_pos=%d n_folds=%d metrics=%s",
             side, model_version, len(X), n_positive, len(fold_metrics), metrics)
    return {
        "side": side,
        "trained_at": trained_at,
        "model_version": model_version,
        "n_train": int(len(X)),
        "n_positive": n_positive,
        "metrics": metrics,
    }


def _load_model(side: str, model_version: str | None = None):
    meta = _load_meta(side, model_version)
    if not meta:
        v = model_version or "latest"
        raise MLNotReady(
            f"модель для {side} ({v}) ещё не обучена — запусти /train_ml"
        )
    with open(meta["path"], "rb") as f:
        bundle = pickle.load(f)
    return bundle["model"], bundle["features"], meta


def _persist_ml_predictions(
    target_date: str, model_version: str, results: dict, made_at: str
) -> None:
    items = list(results.get("buy", [])) + list(results.get("sell", []))
    if not items:
        return
    with get_conn() as conn:
        for r in items:
            rationale = {
                "model": model_version,
                "probability": round(float(r["confidence"]), 6),
            }
            conn.execute(
                """
                INSERT INTO predictions
                  (target_date, made_at, ticker, side, confidence, rank,
                   rule_version, rationale_json)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(target_date, ticker, rule_version) DO UPDATE SET
                  made_at = excluded.made_at,
                  side = excluded.side,
                  confidence = excluded.confidence,
                  rank = excluded.rank,
                  rationale_json = excluded.rationale_json
                """,
                (target_date, made_at, r["ticker"], r["side"],
                 float(r["confidence"]), int(r["rank"]),
                 model_version, json.dumps(rationale, ensure_ascii=False)),
            )


def predict_ml(
    target_date: str | None = None,
    top_n: int = 5,
    model_version: str = MODEL_VERSION,
    persist: bool = True,
) -> dict:
    if model_version == MODEL_VERSION_ENSEMBLE:
        return predict_ensemble(target_date=target_date, top_n=top_n, persist=persist)
    if target_date is None:
        target_date = _next_us_trading_day(date.today()).isoformat()
    as_of = (date.fromisoformat(target_date) - timedelta(days=1)).isoformat()

    universe = resolve_universe()
    features = compute_features_for_universe(as_of, tickers=universe)
    if not features:
        return {"target_date": target_date, "as_of_date": as_of, "buy": [], "sell": [],
                "model_version": model_version,
                "note": "нет фич на дату"}

    if _is_meta(model_version):
        result = _predict_meta(target_date, as_of, features, top_n)
        if persist and (result.get("buy") or result.get("sell")):
            from datetime import datetime, timezone
            _persist_ml_predictions(
                target_date, model_version, result,
                datetime.now(timezone.utc).isoformat(),
            )
        return result

    def _rank(side: str) -> list[dict]:
        try:
            model, feature_names, meta = _load_model(side, model_version)
        except MLNotReady:
            return []
        rows: list[tuple[str, list[float]]] = []
        for t, f in features.items():
            payload = f.to_dict()
            if not _row_eligible(side, model_version, payload):
                continue
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

    result = {
        "target_date": target_date,
        "as_of_date": as_of,
        "model_version": model_version,
        "n_universe": len(features),
        "buy": _rank("BUY"),
        "sell": _rank("SELL"),
    }
    if persist and (result["buy"] or result["sell"]):
        from datetime import datetime, timezone
        _persist_ml_predictions(
            target_date, model_version, result,
            datetime.now(timezone.utc).isoformat(),
        )
    return result


def _predict_meta(
    target_date: str, as_of: str, features: dict, top_n: int
) -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT ticker, side, confidence
               FROM predictions
               WHERE target_date = ? AND rule_version = ?""",
            (target_date, META_UPSTREAM_RULE),
        ).fetchall()
    if not rows:
        return {
            "target_date": target_date, "as_of_date": as_of,
            "model_version": MODEL_VERSION_META,
            "n_universe": len(features),
            "buy": [], "sell": [],
            "note": f"нет mrv-кандидатов на {target_date} — сначала /predict",
        }

    feature_names = _feature_names_for("BUY", MODEL_VERSION_META)

    def _rank(side: str) -> list[dict]:
        try:
            model, feats_from_bundle, meta = _load_model(side, MODEL_VERSION_META)
        except MLNotReady:
            return []
        candidates: list[tuple[str, list[float]]] = []
        for r in rows:
            if r["side"] != side:
                continue
            f = features.get(r["ticker"])
            if f is None:
                continue
            payload = f.to_dict()
            payload["mrv_confidence"] = float(r["confidence"])
            vec: list[float] = []
            skip = False
            for name in feats_from_bundle:
                v = payload.get(name)
                if v is None:
                    skip = True; break
                vec.append(float(v))
            if not skip:
                candidates.append((r["ticker"], vec))
        if not candidates:
            return []
        X = np.array([v for _, v in candidates], dtype=float)
        proba = model.predict_proba(X)[:, 1]
        ranked = sorted(zip([t for t, _ in candidates], proba), key=lambda kv: -kv[1])
        return [
            {"rank": i + 1, "ticker": t, "confidence": float(p), "side": side}
            for i, (t, p) in enumerate(ranked[:top_n])
        ]

    return {
        "target_date": target_date,
        "as_of_date": as_of,
        "model_version": MODEL_VERSION_META,
        "n_universe": len(features),
        "n_mrv_candidates": len(rows),
        "buy": _rank("BUY"),
        "sell": _rank("SELL"),
    }


def predict_ensemble(
    target_date: str | None = None,
    top_n: int = 5,
    component_versions: Iterable[str] = (MODEL_VERSION, MODEL_VERSION_V2),
    persist: bool = True,
) -> dict:
    """Rank-mean ensemble: усредняет ранги top-K тикеров от нескольких моделей."""
    per_side: dict[str, dict[str, list[int]]] = {
        "BUY": defaultdict(list),
        "SELL": defaultdict(list),
    }
    components: list[dict] = []
    resolved_target = target_date
    resolved_as_of = None

    # берём широкий top_n у компонентов — чтобы получить достаточно ранжирования
    component_top_n = max(top_n * 5, 20)

    for ver in component_versions:
        try:
            r = predict_ml(
                target_date=target_date, top_n=component_top_n,
                model_version=ver, persist=False,
            )
        except MLNotReady:
            components.append({"version": ver, "status": "not_ready"})
            continue
        except Exception as e:  # noqa: BLE001
            log.exception("ensemble: %s упал", ver)
            components.append({"version": ver, "status": f"error:{type(e).__name__}"})
            continue
        resolved_target = r["target_date"]
        resolved_as_of = r["as_of_date"]
        components.append({
            "version": ver, "status": "ok",
            "n_buy": len(r.get("buy", [])),
            "n_sell": len(r.get("sell", [])),
        })
        for side_key in ("buy", "sell"):
            for item in r.get(side_key, []):
                per_side[side_key.upper()][item["ticker"]].append(int(item["rank"]))

    def _ensemble_side(side: str) -> list[dict]:
        ranked = []
        max_rank = component_top_n + 1
        for t, ranks in per_side[side].items():
            # тикер, попавший только в топ одной модели — штраф max_rank за отсутствие
            padded = ranks + [max_rank] * (len(components) - len(ranks))
            avg = float(np.mean(padded))
            ranked.append((t, avg, len(ranks)))
        ranked.sort(key=lambda x: (x[1], -x[2]))
        return [
            {"rank": i + 1, "ticker": t, "confidence": 1.0 - (avg / max_rank),
             "side": side, "n_components_agreed": n_agree}
            for i, (t, avg, n_agree) in enumerate(ranked[:top_n])
        ]

    result = {
        "target_date": resolved_target,
        "as_of_date": resolved_as_of,
        "model_version": MODEL_VERSION_ENSEMBLE,
        "components": components,
        "buy": _ensemble_side("BUY"),
        "sell": _ensemble_side("SELL"),
    }
    if persist and resolved_target and (result["buy"] or result["sell"]):
        from datetime import datetime, timezone
        _persist_ml_predictions(
            resolved_target, MODEL_VERSION_ENSEMBLE, result,
            datetime.now(timezone.utc).isoformat(),
        )
    return result


def predict_ml_shadow(
    target_date: str | None = None,
    top_n: int = 5,
    shadow_versions: Iterable[str] = (MODEL_VERSION_V2,),
) -> list[dict]:
    """Прогоняет shadow-версии моделей и пишет их прогнозы в БД.
    Не выбрасывает MLNotReady — если shadow-модель не обучена, тихо скипает.
    Возвращает список результатов для логирования."""
    out: list[dict] = []
    for ver in shadow_versions:
        try:
            r = predict_ml(target_date=target_date, top_n=top_n,
                           model_version=ver, persist=True)
        except MLNotReady as e:
            log.info("ml shadow %s: скип — %s", ver, e)
            continue
        except Exception:  # noqa: BLE001
            log.exception("ml shadow %s: упал", ver)
            continue
        out.append(r)
    return out


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
