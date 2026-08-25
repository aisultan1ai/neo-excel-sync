import json
import logging
from typing import Iterable

from .predictor import RULE_VERSION
from .storage import get_conn
from .universe import resolve_universe

log = logging.getLogger(__name__)

DEFAULT_TOP_N = 5


def _load_predictions(target_date: str, top_n: int, rule_version: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT ticker, side, confidence, rank
               FROM predictions
               WHERE target_date = ? AND rule_version = ? AND rank <= ?
               ORDER BY side, rank""",
            (target_date, rule_version, top_n),
        ).fetchall()
    return [dict(r) for r in rows]


def _load_actual(trade_date: str, universe: Iterable[str]) -> list[dict]:
    uni = tuple(universe)
    placeholders = ",".join("?" for _ in uni)
    with get_conn() as conn:
        rows = conn.execute(
            f"""SELECT DISTINCT ticker, side
                FROM trades
                WHERE trade_date = ? AND ticker IN ({placeholders})""",
            (trade_date, *uni),
        ).fetchall()
    return [dict(r) for r in rows]


def reconcile_day(
    target_date: str,
    top_n: int = DEFAULT_TOP_N,
    rule_version: str = RULE_VERSION,
) -> dict:
    predicted = _load_predictions(target_date, top_n, rule_version)
    actual = _load_actual(target_date, resolve_universe())

    pred_set = {(p["ticker"], p["side"]) for p in predicted}
    actual_set = {(a["ticker"], a["side"]) for a in actual}
    pred_tickers = {p["ticker"] for p in predicted}
    actual_tickers = {a["ticker"] for a in actual}

    hits = sorted(pred_set & actual_set)
    misses = sorted(pred_set - actual_set)
    extras = sorted(actual_set - pred_set)

    n_pred = len(pred_set)
    n_actual = len(actual_set)
    n_hits = len(hits)
    n_overlap = len(pred_tickers & actual_tickers)

    precision = (n_hits / n_pred) if n_pred else 0.0
    recall = (n_hits / n_actual) if n_actual else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    details = {
        "hits": [{"ticker": t, "side": s} for t, s in hits],
        "misses": [{"ticker": t, "side": s} for t, s in misses],
        "extras": [{"ticker": t, "side": s} for t, s in extras],
        "top_n": top_n,
    }

    if n_pred == 0 and n_actual == 0:
        log.info("reconcile %s: пусто (нет прогноза и нет сделок) — не пишем в БД", target_date)
        return {
            "date": target_date,
            "rule_version": rule_version,
            "n_predicted": 0, "n_actual": 0, "n_overlap": 0, "n_side_match": 0,
            "precision": 0.0, "recall": 0.0, "f1": 0.0,
            "hits": [], "misses": [], "extras": [],
            "skipped": True,
        }

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO reconciliations
              (date, rule_version, n_predicted, n_actual, n_overlap, n_side_match,
               precision_, recall, f1, details_json)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(date, rule_version) DO UPDATE SET
              n_predicted = excluded.n_predicted,
              n_actual = excluded.n_actual,
              n_overlap = excluded.n_overlap,
              n_side_match = excluded.n_side_match,
              precision_ = excluded.precision_,
              recall = excluded.recall,
              f1 = excluded.f1,
              details_json = excluded.details_json
            """,
            (target_date, rule_version, n_pred, n_actual, n_overlap, n_hits,
             precision, recall, f1, json.dumps(details, ensure_ascii=False)),
        )

    return {
        "date": target_date,
        "rule_version": rule_version,
        "n_predicted": n_pred,
        "n_actual": n_actual,
        "n_overlap": n_overlap,
        "n_side_match": n_hits,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "hits": details["hits"],
        "misses": details["misses"],
        "extras": details["extras"],
    }


def scorecard(last_n: int = 20, rule_version: str = RULE_VERSION) -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT date, n_predicted, n_actual, n_overlap, n_side_match,
                      precision_, recall, f1, details_json
               FROM reconciliations
               WHERE rule_version = ?
               ORDER BY date DESC LIMIT ?""",
            (rule_version, last_n),
        ).fetchall()

    if not rows:
        return {"n_days": 0, "history": [], "per_ticker": {}, "overall": {},
                "rule_version": rule_version}

    history = []
    per_ticker_hits: dict[str, int] = {}
    per_ticker_misses: dict[str, int] = {}
    per_ticker_extras: dict[str, int] = {}

    sum_p = sum_r = sum_f1 = 0.0
    total_pred = total_actual = total_hits = 0

    for row in rows:
        d = dict(row)
        history.append({
            "date": d["date"],
            "n_predicted": d["n_predicted"],
            "n_actual": d["n_actual"],
            "n_overlap": d["n_overlap"],
            "n_side_match": d["n_side_match"],
            "precision": d["precision_"],
            "recall": d["recall"],
            "f1": d["f1"],
        })
        sum_p += d["precision_"] or 0.0
        sum_r += d["recall"] or 0.0
        sum_f1 += d["f1"] or 0.0
        total_pred += d["n_predicted"] or 0
        total_actual += d["n_actual"] or 0
        total_hits += d["n_side_match"] or 0

        details = json.loads(d["details_json"]) if d["details_json"] else {}
        for h in details.get("hits", []):
            per_ticker_hits[h["ticker"]] = per_ticker_hits.get(h["ticker"], 0) + 1
        for m in details.get("misses", []):
            per_ticker_misses[m["ticker"]] = per_ticker_misses.get(m["ticker"], 0) + 1
        for e in details.get("extras", []):
            per_ticker_extras[e["ticker"]] = per_ticker_extras.get(e["ticker"], 0) + 1

    n = len(rows)
    micro_p = total_hits / total_pred if total_pred else 0.0
    micro_r = total_hits / total_actual if total_actual else 0.0
    micro_f1 = (2 * micro_p * micro_r / (micro_p + micro_r)) if (micro_p + micro_r) else 0.0

    per_ticker = {}
    all_ticks = set(per_ticker_hits) | set(per_ticker_misses) | set(per_ticker_extras)
    for t in sorted(all_ticks):
        per_ticker[t] = {
            "hits": per_ticker_hits.get(t, 0),
            "misses": per_ticker_misses.get(t, 0),
            "extras": per_ticker_extras.get(t, 0),
        }

    history_asc = list(reversed(history))

    return {
        "n_days": n,
        "history": history_asc,
        "per_ticker": per_ticker,
        "rule_version": rule_version,
        "overall": {
            "macro_precision": sum_p / n,
            "macro_recall": sum_r / n,
            "macro_f1": sum_f1 / n,
            "micro_precision": micro_p,
            "micro_recall": micro_r,
            "micro_f1": micro_f1,
        },
    }
