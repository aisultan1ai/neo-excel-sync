"""Клиент Unity REST API."""
import logging

import httpx

from config import API_BASE_URL, API_TIMEOUT, AUTH_TOKEN, DEFAULT_LIMIT

log = logging.getLogger(__name__)


class ApiError(Exception):
    """Ошибка при обращении к Unity API — показывается пользователю."""


async def fetch_trades(
    from_date: str,
    to_date: str,
    account_id: str | None = None,
) -> list[dict]:
    """
    Загрузить все сделки за период [from_date; to_date] (даты включительно).
    Если задан account_id — фильтруем по нему. Пагинация через offset.
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
            if account_id:
                params["accountId"] = account_id

            try:
                resp = await client.get(url, headers=headers, params=params)
            except httpx.TimeoutException:
                log.warning("Timeout при запросе к Unity /trades")
                raise ApiError("Таймаут при запросе к бирже. Попробуйте позже.")
            except httpx.HTTPError as e:
                log.warning("HTTP ошибка /trades: %s", e)
                raise ApiError(f"Ошибка сети: {e}")

            if resp.status_code != 200:
                log.warning("Unity /trades %s: %s", resp.status_code, resp.text[:500])
                raise ApiError(f"Биржа вернула ошибку {resp.status_code}.")

            try:
                data = resp.json()
            except ValueError:
                raise ApiError("Некорректный ответ биржи (не JSON).")

            items = data.get("items") or []
            total = data.get("total") or 0
            all_items.extend(items)

            if not items or len(all_items) >= total:
                break
            offset += DEFAULT_LIMIT

    log.info(
        "Получено %d сделок за %s..%s (accountId=%s)",
        len(all_items), from_date, to_date, account_id or "-",
    )
    return all_items


async def fetch_instrument_details(ids: list[int]) -> dict[int, str]:
    """
    Запросить справочник по конкретным instrumentId и вернуть {id: ticker}.
    Если ids пуст — ничего не делаем. Ошибки не поднимаем: просто пропускаем,
    чтобы не блокировать вывод сделок из-за проблемы со справочником.
    """
    if not ids:
        return {}

    url = f"{API_BASE_URL}/instrumentDetails"
    headers = {"accept": "application/json", "auth-token": AUTH_TOKEN}
    result: dict[int, str] = {}

    # Чанкуем во избежание слишком длинного URL / rate-limits
    CHUNK = 100
    unique_ids = list({int(i) for i in ids})

    async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
        for i in range(0, len(unique_ids), CHUNK):
            chunk = unique_ids[i:i + CHUNK]
            # httpx поддерживает повторяющиеся query-параметры через list-of-tuples
            params: list[tuple[str, str]] = [("instrumentId", str(x)) for x in chunk]
            params.append(("limit", str(len(chunk))))

            try:
                resp = await client.get(url, headers=headers, params=params)
            except httpx.HTTPError as e:
                log.warning("HTTP ошибка /instrumentDetails: %s", e)
                continue

            if resp.status_code != 200:
                log.warning(
                    "Unity /instrumentDetails %s: %s",
                    resp.status_code, resp.text[:300],
                )
                continue

            try:
                data = resp.json()
            except ValueError:
                log.warning("/instrumentDetails: ответ не JSON")
                continue

            items = data.get("items") if isinstance(data, dict) else data
            if not isinstance(items, list):
                continue

            for it in items:
                if not isinstance(it, dict):
                    continue
                iid = it.get("id")
                # Приоритет: ticker > code > name
                ticker = it.get("ticker") or it.get("code") or it.get("name")
                if iid is not None and ticker:
                    result[int(iid)] = str(ticker)

    log.info(
        "Справочник: запрошено %d id, получено %d записей",
        len(unique_ids), len(result),
    )
    return result
