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
                "tradeType": "DIRECT",
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


def _parse_instrument_items(data) -> dict[int, str]:
    """Достаёт {id: ticker} из ответа /instrumentDetails."""
    items = data.get("items") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return {}
    result: dict[int, str] = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        iid = it.get("id")
        ticker = it.get("ticker") or it.get("code") or it.get("name")
        if iid is not None and ticker:
            result[int(iid)] = str(ticker)
    return result


async def _fetch_details_csv(
    client: httpx.AsyncClient,
    ids: list[int],
) -> tuple[dict[int, str], bool]:
    """
    Попытка №1: передать все id одним параметром через запятую.
    Возвращает (mapping, ok) — ok=False если 400/422, чтобы попробовать фолбэк.
    """
    url = f"{API_BASE_URL}/instrumentDetails"
    headers = {"accept": "application/json", "auth-token": AUTH_TOKEN}
    params = {
        "instrumentId": ",".join(str(x) for x in ids),
        "limit": str(len(ids)),
    }
    try:
        resp = await client.get(url, headers=headers, params=params)
    except httpx.HTTPError as e:
        log.warning("HTTP ошибка /instrumentDetails (csv): %s", e)
        return {}, False

    if resp.status_code in (400, 422):
        return {}, False
    if resp.status_code != 200:
        log.warning(
            "Unity /instrumentDetails (csv) %s: %s",
            resp.status_code, resp.text[:300],
        )
        return {}, True  # ok, но пусто — не будем зря фолбэчить

    try:
        return _parse_instrument_items(resp.json()), True
    except ValueError:
        return {}, True


async def _fetch_details_one(
    client: httpx.AsyncClient,
    instr_id: int,
) -> dict[int, str]:
    """Фолбэк: запросить один инструмент отдельным запросом."""
    url = f"{API_BASE_URL}/instrumentDetails"
    headers = {"accept": "application/json", "auth-token": AUTH_TOKEN}
    params = {"instrumentId": str(instr_id), "limit": "1"}
    try:
        resp = await client.get(url, headers=headers, params=params)
    except httpx.HTTPError as e:
        log.warning("HTTP ошибка /instrumentDetails (id=%s): %s", instr_id, e)
        return {}
    if resp.status_code != 200:
        log.warning(
            "Unity /instrumentDetails id=%s → %s: %s",
            instr_id, resp.status_code, resp.text[:200],
        )
        return {}
    try:
        return _parse_instrument_items(resp.json())
    except ValueError:
        return {}


async def fetch_instrument_details(ids: list[int]) -> dict[int, str]:
    """
    Вернуть {id: ticker} по нужным instrumentId.
    Сначала пытаемся одним запросом (CSV-параметр), если API не принимает —
    фолбэк на per-id (медленнее, но результат всё равно кэшируется навсегда).
    Ошибки не поднимаем — справочник не критичен.
    """
    if not ids:
        return {}

    result: dict[int, str] = {}
    unique_ids = list({int(i) for i in ids})

    async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
        # Пробуем batch через CSV; чанкуем по 100 на всякий случай
        CHUNK = 100
        need_fallback = False
        for i in range(0, len(unique_ids), CHUNK):
            chunk = unique_ids[i:i + CHUNK]
            mapping, ok = await _fetch_details_csv(client, chunk)
            if not ok:
                need_fallback = True
                break
            result.update(mapping)

        # Фолбэк: тянем по одному те, что ещё не получены
        if need_fallback:
            missing = [x for x in unique_ids if x not in result]
            log.info(
                "CSV-формат не принят биржей, фолбэк per-id для %d инструментов",
                len(missing),
            )
            for iid in missing:
                mapping = await _fetch_details_one(client, iid)
                result.update(mapping)

    log.info(
        "Справочник: запрошено %d id, получено %d записей",
        len(unique_ids), len(result),
    )
    return result
