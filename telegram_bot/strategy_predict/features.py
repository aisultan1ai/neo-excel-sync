import json
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

import numpy as np
import pandas as pd

from .marketdata import ensure_prices, get_prices
from .storage import get_conn
from .universe import resolve_universe

log = logging.getLogger(__name__)


LOOKBACK_DAYS = 365
SPY_TICKER = "SPY"

# Кросс-ассетные тикеры на Yahoo Finance
MACRO_TICKERS: dict[str, str] = {
    "vix": "^VIX",         # индекс волатильности
    "dxy": "DX-Y.NYB",     # индекс доллара
    "yield_10y": "^TNX",   # доходность 10-летних UST (в единицах × 10, т.е. 40 = 4.0%)
}

# Группировка вселенной по asset class — для class-relative фич.
# Тикер не в справочнике → class-relative фичи будут NULL.
ASSET_CLASSES: dict[str, tuple[str, ...]] = {
    "us_equity_broad":  ("SPY", "QQQ", "DIA", "MDY", "TQQQ", "QLD"),
    "us_equity_sector": ("XLK", "XLE", "XLU", "XLB", "XLI", "XLP", "XLV", "XLF", "XLY"),
    "intl_equity":      ("EWL", "EWJ", "EWG", "EWZ"),
    "commodities":      ("GLD", "SLV", "GDX"),
    "bonds":            ("TLT",),
}
_TICKER_TO_CLASS: dict[str, str] = {
    t: cls for cls, tickers in ASSET_CLASSES.items() for t in tickers
}


def _prev_trading_day(df: pd.DataFrame, target: date) -> date | None:
    if df.empty:
        return None
    idx = pd.to_datetime(df.index).date
    candidates = [d for d in idx if d <= target]
    return max(candidates) if candidates else None


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    return 100.0 - 100.0 / (1.0 + rs)


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False).mean()


def _pct_rank_last(series: pd.Series, window: int = 60) -> float | None:
    s = series.dropna().tail(window)
    if len(s) < 5:
        return None
    last = s.iloc[-1]
    rank = (s <= last).sum() / len(s)
    return float(rank)


@dataclass
class TickerFeatures:
    ticker: str
    as_of_date: str
    close: float | None
    ret_5d: float | None
    ret_20d: float | None
    ret_5d_pctile_60d: float | None
    ret_20d_pctile_60d: float | None
    rsi_14: float | None
    ma20_dist: float | None
    ma50_dist: float | None
    atr_14_pct: float | None
    vol_ratio_20: float | None
    overnight_gap: float | None
    cs_rank_ret_5d: float | None = None
    cs_rank_ret_20d: float | None = None
    cs_rank_rsi_14: float | None = None
    spy_above_ma50: bool | None = None
    spy_above_ma200: bool | None = None
    spy_ret_5d: float | None = None
    spy_ret_20d: float | None = None
    # position-aware (только для тикеров с открытой long-позицией на as_of)
    days_in_position: float | None = None
    unrealized_pnl_pct: float | None = None
    max_dd_in_position: float | None = None
    entry_price: float | None = None
    # ликвидность и кросс-ассетные (одни и те же значения для всех тикеров на as_of)
    dollar_vol_20d: float | None = None
    vix_level: float | None = None
    vix_change_5d: float | None = None
    dxy_change_5d: float | None = None
    yield_10y_level: float | None = None
    yield_10y_change_5d: float | None = None
    # class-relative (тикер vs медиана его asset class)
    asset_class: str | None = None
    class_relative_ret_5d: float | None = None
    class_relative_ret_20d: float | None = None

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


POSITION_FEATURE_NAMES: tuple[str, ...] = (
    "days_in_position",
    "unrealized_pnl_pct",
    "max_dd_in_position",
)


def _load_open_position(ticker: str, as_of_date: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            """SELECT open_date, open_price, amount_remaining
               FROM positions
               WHERE ticker = ?
                 AND open_date <= ?
                 AND (close_date IS NULL OR close_date > ?)
                 AND amount_remaining > 0
               ORDER BY open_date DESC LIMIT 1""",
            (ticker, as_of_date, as_of_date),
        ).fetchone()
    return dict(row) if row else None


def _compute_position_features(
    ticker: str, as_of_date: str, df: pd.DataFrame
) -> dict:
    pos = _load_open_position(ticker, as_of_date)
    if not pos:
        return {}
    open_date = date.fromisoformat(pos["open_date"])
    open_price = float(pos["open_price"])
    if open_price <= 0:
        return {}

    target = date.fromisoformat(as_of_date)
    close = df["close"].astype(float)
    idx_dates = pd.to_datetime(close.index).date
    d = _prev_trading_day(df, target)
    if d is None:
        return {}
    try:
        as_of_pos = list(idx_dates).index(d)
    except ValueError:
        return {}
    close_now = float(close.iloc[as_of_pos])

    # окно [open_date, as_of] по индексу дат
    mask = [(od >= open_date and od <= d) for od in idx_dates]
    win = close[np.asarray(mask)]
    max_dd = None
    if len(win) > 0:
        min_close = float(win.min())
        max_dd = min_close / open_price - 1.0

    return {
        "days_in_position": float((d - open_date).days),
        "unrealized_pnl_pct": close_now / open_price - 1.0,
        "max_dd_in_position": max_dd,
        "entry_price": open_price,
    }


def compute_features(ticker: str, as_of_date: str) -> TickerFeatures | None:
    target = date.fromisoformat(as_of_date)
    from_d = (target - timedelta(days=LOOKBACK_DAYS)).isoformat()
    df = get_prices(ticker, from_d, as_of_date)
    if df.empty:
        return None

    d = _prev_trading_day(df, target)
    if d is None:
        return None

    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    open_ = df["open"].astype(float)
    volume = df["volume"].astype(float)

    idx_pos = list(pd.to_datetime(close.index).date).index(d)
    if idx_pos < 1:
        return None

    def _safe(s: pd.Series, shift: int) -> float | None:
        if idx_pos - shift < 0:
            return None
        v = s.iloc[idx_pos - shift]
        return float(v) if pd.notna(v) else None

    c0 = _safe(close, 0)
    c5 = _safe(close, 5)
    c20 = _safe(close, 20)
    ret_5d = (c0 / c5 - 1.0) if (c0 is not None and c5) else None
    ret_20d = (c0 / c20 - 1.0) if (c0 is not None and c20) else None

    ret_5d_series = close.pct_change(5)
    ret_20d_series = close.pct_change(20)
    pct5 = _pct_rank_last(ret_5d_series.iloc[: idx_pos + 1])
    pct20 = _pct_rank_last(ret_20d_series.iloc[: idx_pos + 1])

    rsi_series = _rsi(close)
    rsi14 = _safe(rsi_series, 0)

    ma20 = close.rolling(20).mean()
    ma50 = close.rolling(50).mean()
    ma20_v = _safe(ma20, 0)
    ma50_v = _safe(ma50, 0)
    ma20_dist = (c0 / ma20_v - 1.0) if (c0 is not None and ma20_v) else None
    ma50_dist = (c0 / ma50_v - 1.0) if (c0 is not None and ma50_v) else None

    atr_series = _atr(high, low, close)
    atr_v = _safe(atr_series, 0)
    atr_pct = (atr_v / c0) if (atr_v is not None and c0) else None

    vol_ma20 = volume.rolling(20).mean()
    vol_ma20_v = _safe(vol_ma20, 0)
    vol_last = _safe(volume, 0)
    vol_ratio = (vol_last / vol_ma20_v) if (vol_last is not None and vol_ma20_v) else None

    dollar_vol_series = (close * volume).rolling(20).mean()
    dollar_vol_20d = _safe(dollar_vol_series, 0)

    prev_close = _safe(close, 1)
    open_last = _safe(open_, 0)
    gap = (open_last / prev_close - 1.0) if (open_last is not None and prev_close) else None

    tf = TickerFeatures(
        ticker=ticker,
        as_of_date=d.isoformat(),
        close=c0,
        ret_5d=ret_5d,
        ret_20d=ret_20d,
        ret_5d_pctile_60d=pct5,
        ret_20d_pctile_60d=pct20,
        rsi_14=rsi14,
        ma20_dist=ma20_dist,
        ma50_dist=ma50_dist,
        atr_14_pct=atr_pct,
        vol_ratio_20=vol_ratio,
        overnight_gap=gap,
        dollar_vol_20d=dollar_vol_20d,
    )
    pos_feats = _compute_position_features(ticker, as_of_date, df)
    for k, v in pos_feats.items():
        setattr(tf, k, v)
    return tf


def _class_medians(features: dict) -> dict[str, dict[str, float | None]]:
    """Медианы ret_5d/ret_20d по каждому asset class (только из имеющихся фич)."""
    by_class: dict[str, dict[str, list[float]]] = {}
    for ticker, f in features.items():
        cls = _TICKER_TO_CLASS.get(ticker)
        if cls is None:
            continue
        bucket = by_class.setdefault(cls, {"ret_5d": [], "ret_20d": []})
        if f.ret_5d is not None:
            bucket["ret_5d"].append(f.ret_5d)
        if f.ret_20d is not None:
            bucket["ret_20d"].append(f.ret_20d)
    out: dict[str, dict[str, float | None]] = {}
    for cls, vals in by_class.items():
        out[cls] = {
            "ret_5d": float(np.median(vals["ret_5d"])) if vals["ret_5d"] else None,
            "ret_20d": float(np.median(vals["ret_20d"])) if vals["ret_20d"] else None,
        }
    return out


def _macro_regime(as_of_date: str) -> dict:
    """Кросс-ассетные фичи: level и 5-дневное изменение VIX, DXY, 10Y."""
    target = date.fromisoformat(as_of_date)
    from_d = (target - timedelta(days=LOOKBACK_DAYS)).isoformat()
    out: dict[str, float | None] = {
        "vix_level": None, "vix_change_5d": None,
        "dxy_change_5d": None,
        "yield_10y_level": None, "yield_10y_change_5d": None,
    }
    for key, ticker in MACRO_TICKERS.items():
        df = get_prices(ticker, from_d, as_of_date)
        if df.empty:
            continue
        close = df["close"].astype(float)
        if close.empty:
            continue
        c0 = float(close.iloc[-1])
        c5 = float(close.iloc[-6]) if len(close) >= 6 else None
        change_5d = ((c0 / c5) - 1.0) if (c5 and c5 != 0) else None
        if key == "vix":
            out["vix_level"] = c0
            out["vix_change_5d"] = change_5d
        elif key == "dxy":
            out["dxy_change_5d"] = change_5d
        elif key == "yield_10y":
            # ^TNX даётся в единицах × 10, приведём к %
            out["yield_10y_level"] = c0 / 10.0
            out["yield_10y_change_5d"] = change_5d
    return out


def _spy_regime(as_of_date: str) -> dict:
    target = date.fromisoformat(as_of_date)
    from_d = (target - timedelta(days=LOOKBACK_DAYS)).isoformat()
    df = get_prices(SPY_TICKER, from_d, as_of_date)
    if df.empty:
        return {"spy_above_ma50": None, "spy_above_ma200": None,
                "spy_ret_5d": None, "spy_ret_20d": None}
    close = df["close"].astype(float)
    c0 = close.iloc[-1]
    ma50 = close.rolling(50).mean().iloc[-1]
    ma200 = close.rolling(200).mean().iloc[-1]
    ret5 = (c0 / close.iloc[-6] - 1.0) if len(close) >= 6 else None
    ret20 = (c0 / close.iloc[-21] - 1.0) if len(close) >= 21 else None
    return {
        "spy_above_ma50": bool(c0 > ma50) if pd.notna(ma50) else None,
        "spy_above_ma200": bool(c0 > ma200) if pd.notna(ma200) else None,
        "spy_ret_5d": float(ret5) if ret5 is not None and pd.notna(ret5) else None,
        "spy_ret_20d": float(ret20) if ret20 is not None and pd.notna(ret20) else None,
    }


def compute_features_for_universe(
    as_of_date: str,
    tickers: Iterable[str] | None = None,
) -> dict[str, TickerFeatures]:
    tickers = list(tickers) if tickers is not None else list(resolve_universe())
    target = date.fromisoformat(as_of_date)
    from_d = (target - timedelta(days=LOOKBACK_DAYS)).isoformat()

    ensure_prices([*tickers, SPY_TICKER, *MACRO_TICKERS.values()], from_d, as_of_date)

    features: dict[str, TickerFeatures] = {}
    for t in tickers:
        f = compute_features(t, as_of_date)
        if f is not None:
            features[t] = f

    if not features:
        return features

    def _rank_map(getter) -> dict[str, float]:
        pairs = [(t, getter(f)) for t, f in features.items() if getter(f) is not None]
        if not pairs:
            return {}
        pairs.sort(key=lambda x: x[1])
        n = len(pairs)
        return {t: (i + 1) / n for i, (t, _) in enumerate(pairs)}

    ranks_ret5 = _rank_map(lambda f: f.ret_5d)
    ranks_ret20 = _rank_map(lambda f: f.ret_20d)
    ranks_rsi = _rank_map(lambda f: f.rsi_14)

    class_medians = _class_medians(features)

    regime = _spy_regime(as_of_date)
    macro = _macro_regime(as_of_date)

    with get_conn() as conn:
        for t, f in features.items():
            f.cs_rank_ret_5d = ranks_ret5.get(t)
            f.cs_rank_ret_20d = ranks_ret20.get(t)
            f.cs_rank_rsi_14 = ranks_rsi.get(t)
            f.spy_above_ma50 = regime["spy_above_ma50"]
            f.spy_above_ma200 = regime["spy_above_ma200"]
            f.spy_ret_5d = regime["spy_ret_5d"]
            f.spy_ret_20d = regime["spy_ret_20d"]
            for k, v in macro.items():
                setattr(f, k, v)
            cls = _TICKER_TO_CLASS.get(t)
            if cls is not None:
                f.asset_class = cls
                med = class_medians.get(cls, {})
                if f.ret_5d is not None and med.get("ret_5d") is not None:
                    f.class_relative_ret_5d = f.ret_5d - med["ret_5d"]
                if f.ret_20d is not None and med.get("ret_20d") is not None:
                    f.class_relative_ret_20d = f.ret_20d - med["ret_20d"]
            conn.execute(
                """
                INSERT OR REPLACE INTO features (ticker, as_of_date, payload)
                VALUES (?, ?, ?)
                """,
                (t, f.as_of_date, json.dumps(f.to_dict(), ensure_ascii=False)),
            )

    return features


def load_features(ticker: str, as_of_date: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT payload FROM features WHERE ticker = ? AND as_of_date = ?",
            (ticker, as_of_date),
        ).fetchone()
    if not row:
        return None
    return json.loads(row["payload"])
