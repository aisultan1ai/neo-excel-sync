"""Правила раздела «Доходы»: настройки по умолчанию, роль счёта, вид инструмента, курсы."""
from __future__ import annotations

# Виды дохода (ключ → подпись). Порядок = порядок колонок в отчётах.
CATEGORIES = {
    "commission": "Комиссионный доход",
    "conversion": "Доход от конвертации",
    "markup": "Mark-up",
    "crypto": "Крипта",
}

UNKNOWN_PROVIDER = "Не определён"

DEFAULT_SETTINGS: dict = {
    # Конвертации: категория инструмента в Unity и/или префикс тикера/кода
    "conversion_categories": ["CASH"],
    "conversion_prefixes": ["CASH."],
    # Крипта: категория и/или префикс тикера/кода (EQ — акции, CR — крипта)
    "crypto_categories": ["CR"],
    "crypto_prefixes": ["CR."],
    # Какие сделки грузить (tradeType в Unity)
    "trade_types": ["DIRECT", "CONVERSION"],
    # Какие транзакции грузить: фандинг входит в доход, комиссии — для сверки
    "transaction_types": ["FUNDING_FEE", "TRADE_COMMISSION"],
    # Сопоставление сделки клиента со сделкой провайдера без Execution ID:
    # тот же инструмент, сторона и объём, разница во времени не больше N секунд
    "match_window_sec": 5,
    # Сколько запросов orderDetails (Execution ID) делать за одну загрузку
    "order_details_limit": 500,
    # По каким сделкам запрашивать Execution ID: только конвертации или все
    "order_details_scope": "conversion",   # conversion | all
    # Сколько счетов передавать в одном запросе trades/transactions
    "accounts_per_request": 150,
}

USD = "USD"
# Валюты, котируемые как CCYUSD (1 CCY = x USD); остальные — USDCCY (1 USD = x CCY)
CCYUSD_DEFAULT = {"EUR", "GBP", "AUD", "NZD", "XAU", "XAG"}


def merge_settings(stored: dict | None) -> dict:
    out = {k: (list(v) if isinstance(v, list) else v) for k, v in DEFAULT_SETTINGS.items()}
    for k, v in (stored or {}).items():
        if k in out and v is not None:
            out[k] = v
    return out


def default_rate_mode(ccy: str) -> str:
    return "CCYUSD" if (ccy or "").upper() in CCYUSD_DEFAULT else "USDCCY"


def pair_label(ccy: str, mode: str) -> str:
    return f"{ccy}USD" if mode == "CCYUSD" else f"USD{ccy}"


def effective_role(acc: dict | None) -> str:
    """client | provider. Ручная настройка важнее авто-правила (REAL = счёт провайдера)."""
    if not acc:
        return "client"
    role = acc.get("role")
    if role in ("client", "provider"):
        return role
    if (acc.get("accounting_type") or "").upper() == "REAL":
        return "provider"
    return "client"


def profile_of(acc: dict | None, account_id) -> str:
    if acc:
        for key in ("profile_label", "client_profile_name"):
            if acc.get(key):
                return str(acc[key]).strip()
    return f"Счёт {account_id}"


def account_title(acc: dict | None, account_id) -> str:
    name = (acc or {}).get("name")
    return f"{account_id} | {name}" if name else str(account_id)


def _starts(values: list, prefixes: list) -> bool:
    for v in values:
        v = (v or "").upper()
        for p in prefixes or []:
            p = (p or "").upper()
            if p and v.startswith(p):
                return True
    return False


def classify_instrument(instr: dict | None, settings: dict) -> str:
    """conversion | crypto | other"""
    if not instr:
        return "other"
    cat = (instr.get("category") or "").upper()
    names = [instr.get("ticker"), instr.get("code")]
    if cat in {c.upper() for c in settings["conversion_categories"]} or _starts(names, settings["conversion_prefixes"]):
        return "conversion"
    if cat in {c.upper() for c in settings["crypto_categories"]} or _starts(names, settings["crypto_prefixes"]):
        return "crypto"
    return "other"


def to_usd(amount: float, ccy: str | None, rates: dict) -> float | None:
    """rates = {CCY: {"rate": x, "mode": "CCYUSD"|"USDCCY"}}. None — курса нет."""
    if amount == 0:
        return 0.0
    ccy = (ccy or "").upper()
    if ccy == USD:
        return amount
    r = rates.get(ccy)
    if not r or not r.get("rate"):
        return None
    rate = float(r["rate"])
    return amount * rate if r.get("mode") == "CCYUSD" else amount / rate
