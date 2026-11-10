import logging
import re
import threading
import time
from datetime import date, timedelta

import requests

log = logging.getLogger(__name__)


def _call(
    endpoint: str,
    base_url: str,
    auth_token: str,
    account_id: int,
    asset_id: int,
    amount: float,
    netting_date: str,
    real_account_id: int,
    comment: str = "",
    internal_comment: str = "",
) -> dict:
    url = f"{base_url.rstrip('/')}{endpoint}"
    payload = {
        "accountId": account_id,
        "assetId": asset_id,
        "amount": amount,
        "nettingDate": netting_date,
        "comment": comment,
        "internalComment": internal_comment,
        "realAccountId": real_account_id,
    }
    resp = requests.post(
        url,
        json=payload,
        headers={"auth-token": auth_token, "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def send_cashin(
    base_url: str, auth_token: str, account_id: int, asset_id: int,
    amount: float, netting_date: str, real_account_id: int,
    comment: str = "", internal_comment: str = "",
) -> dict:
    return _call("/api/v1/cashIn", base_url, auth_token, account_id, asset_id,
                 amount, netting_date, real_account_id, comment, internal_comment)


def send_cashout(
    base_url: str, auth_token: str, account_id: int, asset_id: int,
    amount: float, netting_date: str, real_account_id: int,
    comment: str = "", internal_comment: str = "",
) -> dict:
    return _call("/api/v1/cashOut", base_url, auth_token, account_id, asset_id,
                 amount, netting_date, real_account_id, comment, internal_comment)


# ── Чтение данных (позиции, сделки, инструменты) ──────────────────────────────

# Unity лимитирует запросы в «units» (x-limit-* заголовки). Стоимость запросов
# по диапазону дат (trades и т.п.) растёт с шириной диапазона, поэтому:
#  - запросы идут строго последовательно (общий лимит на токен),
#  - на 429 ждём x-limit-retry-after-ms и повторяем,
#  - сделки запрашиваем узкими окнами (TRADES_WINDOW_DAYS).

TRADES_WINDOW_DAYS = 90
_MAX_RETRIES = 6
_MAX_WAIT_S = 90          # дольше ждать не имеет смысла — исчерпан минутный/дневной лимит
_lock = threading.Lock()


class UnityRateLimitError(Exception):
    pass


def _retry_after_s(resp: requests.Response) -> float:
    raw = resp.headers.get("x-limit-retry-after-ms")
    if raw is None:
        m = re.search(r"retry after (\d+)\s*(?:ms|milliseconds)", resp.text or "", re.I)
        raw = m.group(1) if m else None
    try:
        return max(float(raw) / 1000, 0.2) if raw is not None else 1.0
    except ValueError:
        return 1.0


def _csv(values) -> str:
    """Массивы с explode:false передаются через запятую."""
    return ",".join(str(v) for v in values)


def _get(base_url: str, auth_token: str, endpoint: str, params) -> dict:
    url = f"{base_url.rstrip('/')}{endpoint}"
    headers = {"auth-token": auth_token} if auth_token else {}
    with _lock:
        for attempt in range(_MAX_RETRIES + 1):
            resp = requests.get(url, headers=headers, params=params, timeout=60)
            if resp.status_code != 429:
                resp.raise_for_status()
                return resp.json()
            wait = _retry_after_s(resp)
            if wait > _MAX_WAIT_S or attempt == _MAX_RETRIES:
                raise UnityRateLimitError(
                    f"Превышен лимит запросов Unity API, повторите через {int(wait) + 1} с "
                    f"({resp.text[:200]})"
                )
            log.info("Unity 429 на %s, жду %.1f с (попытка %d)", endpoint, wait, attempt + 1)
            time.sleep(wait)
    raise UnityRateLimitError("Превышен лимит запросов Unity API")


def get_accounts(base_url: str, auth_token: str, account_ids: list) -> dict:
    """{accountId(str): account} — нужен openDate счёта."""
    result: dict = {}
    ids = [int(a) for a in account_ids]
    for i in range(0, len(ids), 100):
        part = ids[i:i + 100]
        data = _get(base_url, auth_token, "/api/v1/accounts",
                    {"accountId": _csv(part), "offset": 0, "limit": len(part)}) or {}
        items = data.get("items") if isinstance(data, dict) else data
        for acc in items or []:
            result[str(acc.get("accountId"))] = acc
    return result


def get_account_positions(base_url: str, auth_token: str, account_id: str, currency: int) -> list:
    data = _get(base_url, auth_token, "/api/v1/accountPositions",
                {"accountId": account_id, "currency": currency})
    return (data or {}).get("positions") or []


def _date_windows(from_date: str, to_date: str, days: int):
    start, end = date.fromisoformat(from_date), date.fromisoformat(to_date)
    while start <= end:
        stop = min(start + timedelta(days=days - 1), end)
        yield start.isoformat(), stop.isoformat()
        start = stop + timedelta(days=1)


def get_trades(
    base_url: str, auth_token: str, account_id: str,
    from_date: str, to_date: str, trade_type: str = "DIRECT", page_size: int = 500,
) -> list:
    """Все сделки счёта за период: окнами по TRADES_WINDOW_DAYS, внутри — пагинация.

    Unity ограничивает limit значением 500 (больше — всё равно вернёт 500),
    поэтому offset двигаем на фактическое число полученных записей."""
    items: list = []
    for w_from, w_to in _date_windows(from_date, to_date, TRADES_WINDOW_DAYS):
        offset = 0
        while True:
            data = _get(base_url, auth_token, "/api/v1/trades", {
                "accountId": account_id,
                "tradeType": trade_type,
                "fromTradeDate": w_from,
                "toTradeDate": w_to,
                "dir": "ASC",
                "offset": offset,
                "limit": page_size,
            }) or {}
            page = data.get("items") or []
            items.extend(page)
            offset += len(page)
            total = data.get("total")
            if not page or (total is not None and offset >= total):
                break
    return items


def get_instrument_details(base_url: str, auth_token: str, instrument_ids: list, chunk: int = 100) -> dict:
    """{instrumentId: details} для переданных ID."""
    result: dict = {}
    ids = sorted({int(i) for i in instrument_ids if i is not None})
    for i in range(0, len(ids), chunk):
        part = ids[i:i + chunk]
        data = _get(base_url, auth_token, "/api/v1/instrumentDetails",
                    {"instrumentId": _csv(part), "offset": 0, "limit": len(part)}) or {}
        for item in data.get("items") or []:
            result[item.get("id")] = item
    return result
