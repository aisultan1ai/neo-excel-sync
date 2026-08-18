import json
import logging
import math
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone

from .config import UNIVERSE_TICKERS
from .features import compute_features_for_universe
from .storage import get_conn
from .universe import resolve_universe

log = logging.getLogger(__name__)

RULE_VERSION = "mrv-1.0"
DEFAULT_TOP_N = 5


@dataclass
class RankedPrediction:
    ticker: str
    side: str
    confidence: float
    rank: int
    buy_score: float
    sell_score: float
    features_snapshot: dict


def _as_of_for(target_date: str) -> str:
    return (date.fromisoformat(target_date) - timedelta(days=1)).isoformat()


def _next_us_trading_day(from_d: date) -> date:
    d = from_d + timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _score(feat: dict) -> tuple[float, float]:
    r5 = feat.get("cs_rank_ret_5d")
    rsi_rank = feat.get("cs_rank_rsi_14")
    ma20 = feat.get("ma20_dist")
    spy_bull = feat.get("spy_above_ma50")

    r5 = 0.5 if r5 is None else float(r5)
    rsi_rank = 0.5 if rsi_rank is None else float(rsi_rank)
    ma20 = 0.0 if ma20 is None else float(ma20)

    buy = 2.0 * (1.0 - r5) + 1.0 * (1.0 - rsi_rank) + 0.5 * max(-ma20 * 20.0, 0.0)
    sell = 2.0 * r5 + 1.0 * rsi_rank + 0.5 * max(ma20 * 20.0, 0.0)

    if spy_bull is True:
        buy += 0.5
    elif spy_bull is False:
        sell += 0.5
    return buy, sell


def predict(
    target_date: str | None = None,
    top_n: int = DEFAULT_TOP_N,
) -> dict:
    if target_date is None:
        target_date = _next_us_trading_day(date.today()).isoformat()

    as_of = _as_of_for(target_date)
    features = compute_features_for_universe(as_of)
    if not features:
        n_uni = len(resolve_universe())
        return {
            "target_date": target_date,
            "as_of_date": as_of,
            "buy": [],
            "sell": [],
            "note": (
                f"Нет данных для расчёта фич (as_of={as_of}, universe={n_uni} тикеров). "
                "Yahoo Finance не вернул котировки — проверь docker compose logs bot "
                "(строки yfinance/marketdata) и версию yfinance."
            ),
        }

    scored: list[RankedPrediction] = []
    for t, f in features.items():
        payload = f.to_dict()
        buy, sell = _score(payload)
        total = buy + sell
        if total <= 0:
            continue
        side = "BUY" if buy >= sell else "SELL"
        confidence = (buy if side == "BUY" else sell) / total
        scored.append(RankedPrediction(
            ticker=t, side=side, confidence=confidence, rank=0,
            buy_score=buy, sell_score=sell,
            features_snapshot=payload,
        ))

    buys = sorted([s for s in scored if s.side == "BUY"], key=lambda x: -x.confidence)
    sells = sorted([s for s in scored if s.side == "SELL"], key=lambda x: -x.confidence)
    for i, s in enumerate(buys, 1):
        s.rank = i
    for i, s in enumerate(sells, 1):
        s.rank = i

    _persist_predictions(target_date, buys + sells)

    return {
        "target_date": target_date,
        "as_of_date": (next(iter(features.values())).as_of_date),
        "rule_version": RULE_VERSION,
        "buy": [asdict(x) for x in buys[:top_n]],
        "sell": [asdict(x) for x in sells[:top_n]],
        "n_universe": len(features),
    }


def _persist_predictions(target_date: str, items: list[RankedPrediction]) -> None:
    if not items:
        return
    made_at = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        for r in items:
            rationale = {
                "rule": RULE_VERSION,
                "scores": {"buy": round(r.buy_score, 4), "sell": round(r.sell_score, 4)},
                "components": {
                    "cs_rank_ret_5d": r.features_snapshot.get("cs_rank_ret_5d"),
                    "cs_rank_rsi_14": r.features_snapshot.get("cs_rank_rsi_14"),
                    "ma20_dist": r.features_snapshot.get("ma20_dist"),
                    "spy_above_ma50": r.features_snapshot.get("spy_above_ma50"),
                    "ret_5d_pctile_60d": r.features_snapshot.get("ret_5d_pctile_60d"),
                    "rsi_14": r.features_snapshot.get("rsi_14"),
                },
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
                (target_date, made_at, r.ticker, r.side, r.confidence, r.rank,
                 RULE_VERSION, json.dumps(rationale, ensure_ascii=False)),
            )


def why(ticker: str, target_date: str | None = None) -> dict | None:
    with get_conn() as conn:
        if target_date:
            row = conn.execute(
                """SELECT target_date, made_at, side, confidence, rank, rationale_json
                   FROM predictions WHERE ticker=? AND target_date=? AND rule_version=?""",
                (ticker, target_date, RULE_VERSION),
            ).fetchone()
        else:
            row = conn.execute(
                """SELECT target_date, made_at, side, confidence, rank, rationale_json
                   FROM predictions WHERE ticker=? AND rule_version=?
                   ORDER BY target_date DESC LIMIT 1""",
                (ticker, RULE_VERSION),
            ).fetchone()
    if not row:
        return None
    return {
        "ticker": ticker,
        "target_date": row["target_date"],
        "made_at": row["made_at"],
        "side": row["side"],
        "confidence": row["confidence"],
        "rank": row["rank"],
        "rationale": json.loads(row["rationale_json"]) if row["rationale_json"] else {},
    }
