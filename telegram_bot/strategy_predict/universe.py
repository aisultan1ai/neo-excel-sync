import logging
import time

from .config import DEFAULT_UNIVERSE_TICKERS, FLOT_TICKER, PREDICT_UNIVERSE_ENV
from .storage import get_conn

log = logging.getLogger(__name__)

_CACHE_TTL_SEC = 60.0
_cache: tuple[float, tuple[str, ...]] | None = None


def _parse_env(raw: str) -> tuple[str, ...]:
    out: list[str] = []
    for t in raw.split(","):
        t = t.strip().upper()
        if t and t != FLOT_TICKER:
            out.append(t)
    return tuple(out)


def _from_trades() -> tuple[str, ...]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT ticker FROM trades WHERE ticker != ? ORDER BY ticker",
            (FLOT_TICKER,),
        ).fetchall()
    return tuple(r["ticker"] for r in rows)


def resolve_universe(force_refresh: bool = False) -> tuple[str, ...]:
    global _cache
    now = time.time()
    if _cache is not None and not force_refresh:
        ts, cached = _cache
        if now - ts < _CACHE_TTL_SEC:
            return cached

    if PREDICT_UNIVERSE_ENV:
        result = _parse_env(PREDICT_UNIVERSE_ENV)
        source = "env"
    else:
        from_db = _from_trades()
        if from_db:
            result = from_db
            source = "trades"
        else:
            result = DEFAULT_UNIVERSE_TICKERS
            source = "default"

    if not result:
        result = DEFAULT_UNIVERSE_TICKERS
        source = "default(env-was-empty)"

    _cache = (now, result)
    log.info("universe: %d тикеров, источник=%s", len(result), source)
    return result


def invalidate_cache() -> None:
    global _cache
    _cache = None
