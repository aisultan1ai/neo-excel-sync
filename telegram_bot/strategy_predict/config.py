import os
from pathlib import Path

from config import DATA_DIR

DB_PATH: Path = DATA_DIR / "predict.db"

ALGO_ACCOUNT_ID: str | None = os.environ.get("ALGO_ACCOUNT_ID") or None

FLOT_TICKER = "FLOT"
INCLUDE_FLOT_CONTEXT = os.environ.get("INCLUDE_FLOT_CONTEXT", "0") == "1"

PREDICT_UNIVERSE_ENV: str | None = os.environ.get("PREDICT_UNIVERSE") or None

DEFAULT_UNIVERSE_TICKERS: tuple[str, ...] = (
    "XLK", "XLE", "XLU", "XLB", "XLI", "XLP", "XLV", "XLF", "XLY",
    "SPY", "QQQ", "DIA", "MDY",
    "EWL", "EWJ", "EWG", "EWZ",
    "GLD", "SLV", "GDX",
    "TLT",
    "TQQQ", "QLD",
)

UNIVERSE_TICKERS = DEFAULT_UNIVERSE_TICKERS

MIN_RECONCILIATIONS_FOR_ML = 30
