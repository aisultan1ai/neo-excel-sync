"""Клиент Unity REST API."""
import logging

import httpx

from config import (
    ACCOUNT_ID,
    API_BASE_URL,
    API_TIMEOUT,
    AUTH_TOKEN,
    DEFAULT_LIMIT,
)

log = logging.getLogger(__name__)


class ApiError(Exception):
    """Ошибка при обращении к Unity API — показывается пользователю."""


async def fetch_trades(from_date: str, to_date: str) -> list[dict]:
    """
    Загрузить все сделки за период [from_date; to_date] (даты включительно).
    Пагинирует через offset, пока не выгребет всё, что вернул API.
    """
    url = f"{API_BASE_URL}/trades"
    headers = {"accept": "application/json", "auth-token": AUTH_TOKEN}

    all_items: list[dict] = []
    offset = 0

    async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
        while True:
            params: dict = {
                "fromTradeDate": from_date,
                "toTradeDate": to_date,
                "limit": DEFAULT_LIMIT,
                "offset": offset,
            }
            if ACCOUNT_ID:
                params["accountId"] = ACCOUNT_ID

            try:
                resp = await client.get(url, headers=headers, params=params)
            except httpx.TimeoutException:
                log.warning("Timeout при запросе к Unity")
                raise ApiError("Таймаут при запросе к бирже. Попробуйте позже.")
            except httpx.HTTPError as e:
                log.warning("HTTP ошибка: %s", e)
                raise ApiError(f"Ошибка сети: {e}")

            if resp.status_code != 200:
                log.warning("Unity вернул %s: %s", resp.status_code, resp.text[:500])
                raise ApiError(f"Биржа вернула ошибку {resp.status_code}.")

            try:
                data = resp.json()
            except ValueError:
                raise ApiError("Некорректный ответ биржи (не JSON).")

            items = data.get("items") or []
            total = data.get("total") or 0
            all_items.extend(items)

            # Выходим если больше нечего забирать
            if not items or len(all_items) >= total:
                break
            offset += DEFAULT_LIMIT

    log.info(
        "Получено %d сделок за %s..%s (accountId=%s)",
        len(all_items), from_date, to_date, ACCOUNT_ID or "-",
    )
    return all_items
