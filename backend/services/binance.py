import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone
from typing import Generator, List, Optional, Tuple
from urllib.parse import urlencode

import requests

BASE_URL = "https://fapi.binance.com"
RECV_WINDOW = 5000
LIMIT = 1000
LOCAL_TZ = timezone(timedelta(hours=5))
FUTURES_LAUNCH = datetime(2019, 9, 1, tzinfo=timezone.utc)


def _sign(params: dict, secret: str) -> str:
    qs = urlencode(params, doseq=True)
    return hmac.new(secret.encode(), qs.encode(), hashlib.sha256).hexdigest()


def _get(path: str, params: dict, api_key: str, api_secret: str):
    p = params.copy()
    p["timestamp"] = int(time.time() * 1000)
    p["recvWindow"] = RECV_WINDOW
    p["signature"] = _sign(p, api_secret)
    resp = requests.get(
        f"{BASE_URL}{path}",
        params=p,
        headers={"X-MBX-APIKEY": api_key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _date_range(start_date: Optional[str], end_date: Optional[str]) -> Tuple[int, int]:
    start_dt = (
        datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if start_date
        else FUTURES_LAUNCH
    )
    end_dt = (
        datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        + timedelta(days=1)
        - timedelta(milliseconds=1)
        if end_date
        else datetime.now(timezone.utc)
    )
    return int(start_dt.timestamp() * 1000), int(end_dt.timestamp() * 1000)


def _enrich(row: dict) -> dict:
    ts_ms = int(row["time"])
    dt_utc = datetime.fromtimestamp(ts_ms / 1000, timezone.utc)
    return {
        "symbol": row.get("symbol") or "NO_SYMBOL",
        "asset": row.get("asset", "USDT"),
        "income": float(row["income"]),
        "income_type": row.get("incomeType", "FUNDING_FEE"),
        "tran_id": int(row.get("tranId", 0)),
        "time_ms": ts_ms,
        "datetime_utc": dt_utc,
        "date_local": dt_utc.date(),
    }


def fetch_funding_records(
    api_key: str,
    api_secret: str,
    symbol: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> List[dict]:
    return [
        r
        for _, _, batch in fetch_funding_iter(api_key, api_secret, symbol, start_date, end_date)
        for r in batch
    ]


def fetch_funding_iter(
    api_key: str,
    api_secret: str,
    symbol: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Generator[Tuple[int, int, List[dict]], None, None]:
    start_ms, end_ms = _date_range(start_date, end_date)
    cursor = start_ms
    page = 0
    total = 0

    while cursor < end_ms:
        page += 1
        params: dict = {
            "incomeType": "FUNDING_FEE",
            "startTime": cursor,
            "endTime": end_ms,
            "limit": LIMIT,
        }
        if symbol:
            params["symbol"] = symbol

        data = _get("/fapi/v1/income", params, api_key, api_secret)
        if not isinstance(data, list) or not data:
            break

        batch = [_enrich(row) for row in data]
        total += len(batch)
        yield page, total, batch

        if len(data) < LIMIT:
            break
        cursor = int(data[-1]["time"]) + 1


def get_available_symbols(api_key: str, api_secret: str) -> list:
    data = _get(
        "/fapi/v1/income",
        {
            "incomeType": "FUNDING_FEE",
            "limit": 1000,
            "startTime": int((datetime.now(timezone.utc) - timedelta(days=30)).timestamp() * 1000),
        },
        api_key,
        api_secret,
    )
    if not isinstance(data, list):
        return []
    return sorted({row["symbol"] for row in data if row.get("symbol")})
