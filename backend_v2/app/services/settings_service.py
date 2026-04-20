import json
import os
from typing import Any

from app.core.config import settings


DEFAULT_SETTINGS: dict[str, Any] = {
    "podft_sum_col": "Сумма тг",
    "podft_threshold": "7000000",
    "podft_filter_enabled": True,
    "podft_filter_col": "Рынок ЦБ",
    "podft_filter_values": "COMMODITY, CRYPTO, FOREX",
    "bo_enabled": True,
    "bo_unity_instrument_col": "Instrument",
    "bo_ais_sum_col": "Сумма тг",
    "bo_threshold": "45000000",
    "bo_prefixes": "[BO], [OP]",
    "default_id_names": ["Execution ID", "ID сделки на бирже"],
    "default_acc_name_unity": "Account",
    "default_acc_name_ais": "Субсчет в учетной организации",
    "overlap_accounts": [],
    "split_check_enabled": False,
    "split_list_path": "",
    "split_list_isin_col": "ID_ISIN",
    "daily_file_security_col": "Ценная бумага",
    "split_daily_qty_col": "Количество",
    "crypto_enabled": True,
    "crypto_keywords": "USDT",
    "crypto_col": "Валюта",
}


def ensure_settings_storage():
    os.makedirs(settings.SETTINGS_DIR, exist_ok=True)


def load_settings() -> dict[str, Any]:
    ensure_settings_storage()

    if not os.path.exists(settings.SETTINGS_FILE):
        save_settings(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)

    with open(settings.SETTINGS_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)

    merged = dict(DEFAULT_SETTINGS)
    merged.update(raw or {})
    return merged


def save_settings(new_settings: dict[str, Any]) -> dict[str, Any]:
    ensure_settings_storage()

    merged = dict(DEFAULT_SETTINGS)
    merged.update(new_settings or {})

    with open(settings.SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    return merged