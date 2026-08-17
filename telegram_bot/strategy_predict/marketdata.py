import logging
from datetime import date, timedelta
from typing import Iterable

import pandas as pd
import yfinance as yf

from .storage import get_conn

log = logging.getLogger(__name__)


PRICE_COLS = ("open", "high", "low", "close", "adj_close", "volume")


def _load_cached(ticker: str, from_date: str, to_date: str) -> pd.DataFrame:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT date, open, high, low, close, adj_close, volume
            FROM daily_prices
            WHERE ticker = ? AND date BETWEEN ? AND ?
            ORDER BY date
            """,
            (ticker, from_date, to_date),
        ).fetchall()
    if not rows:
        return pd.DataFrame(columns=PRICE_COLS)
    df = pd.DataFrame([dict(r) for r in rows])
    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df.set_index("date")[list(PRICE_COLS)]


def _save_prices(ticker: str, df: pd.DataFrame) -> int:
    if df is None or df.empty:
        return 0
    rows = []
    for idx, row in df.iterrows():
        d = idx.date() if hasattr(idx, "date") else idx
        rows.append((
            ticker, str(d),
            _num(row.get("open")), _num(row.get("high")), _num(row.get("low")),
            _num(row.get("close")), _num(row.get("adj_close")), _num(row.get("volume")),
        ))
    with get_conn() as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO daily_prices
              (ticker, date, open, high, low, close, adj_close, volume)
            VALUES (?,?,?,?,?,?,?,?)
            """,
            rows,
        )
    return len(rows)


def _num(x) -> float | None:
    if x is None:
        return None
    try:
        f = float(x)
        if f != f:
            return None
        return f
    except (TypeError, ValueError):
        return None


def _yf_download(tickers: list[str], from_date: str, to_date: str) -> dict[str, pd.DataFrame]:
    end = (date.fromisoformat(to_date) + timedelta(days=1)).isoformat()

    raw = yf.download(
        tickers=" ".join(tickers),
        start=from_date,
        end=end,
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=True,
        group_by="ticker",
    )
    result: dict[str, pd.DataFrame] = {}
    if raw is None or raw.empty:
        return result

    if isinstance(raw.columns, pd.MultiIndex):
        available = set(raw.columns.get_level_values(0))
        for t in tickers:
            if t not in available:
                continue
            df = raw[t].copy()
            df.columns = [str(c).lower().replace(" ", "_") for c in df.columns]
            result[t] = _standardize_columns(df)
    else:
        t = tickers[0]
        df = raw.copy()
        df.columns = [str(c).lower().replace(" ", "_") for c in df.columns]
        result[t] = _standardize_columns(df)
    return result


def _standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename = {"adj close": "adj_close"}
    df = df.rename(columns=rename)
    for col in PRICE_COLS:
        if col not in df.columns:
            df[col] = None
    df = df[list(PRICE_COLS)]
    df = df.dropna(subset=["close"])
    return df


def get_prices(ticker: str, from_date: str, to_date: str) -> pd.DataFrame:
    cached = _load_cached(ticker, from_date, to_date)
    if not cached.empty:
        first_cached = cached.index.min()
        last_cached = cached.index.max()
        needed_last = date.fromisoformat(to_date)
        if (needed_last - last_cached).days <= 1:
            return cached

    downloaded = _yf_download([ticker], from_date, to_date)
    df = downloaded.get(ticker)
    n = _save_prices(ticker, df) if df is not None else 0
    log.info("marketdata: %s → yfinance download %d bars (%s..%s)", ticker, n, from_date, to_date)
    return _load_cached(ticker, from_date, to_date)


def ensure_prices(tickers: Iterable[str], from_date: str, to_date: str) -> dict[str, int]:
    tickers = list(dict.fromkeys(tickers))
    to_fetch: list[str] = []
    right = date.fromisoformat(to_date)

    for t in tickers:
        cached = _load_cached(t, from_date, to_date)
        if cached.empty or (right - cached.index.max()).days > 1:
            to_fetch.append(t)

    saved: dict[str, int] = {t: 0 for t in tickers}
    if not to_fetch:
        return saved

    log.info("marketdata: yfinance batch %d тикеров (%s..%s)", len(to_fetch), from_date, to_date)
    downloaded = _yf_download(to_fetch, from_date, to_date)
    for t, df in downloaded.items():
        saved[t] = _save_prices(t, df)
    return saved
