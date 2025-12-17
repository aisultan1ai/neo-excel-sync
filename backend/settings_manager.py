import json
import os
import logging

SETTINGS_FILE = "settings.json"
log = logging.getLogger(__name__)


def get_default_settings():
    """Возвращает словарь с настройками по умолчанию."""
    return {
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

        # --- БЛОК ДЛЯ СПЛИТОВ ---
        "split_check_enabled": False,
        "split_list_path": "",
        "split_list_isin_col": "ID_ISIN",
        "daily_file_security_col": "Ценная бумага",
        "split_daily_qty_col": "Количество"

    }


def load_settings():
    """Загружает настройки из JSON-файла. Дополняет недостающие ключи из default."""
    if not os.path.exists(SETTINGS_FILE):
        log.warning("Файл настроек %s не найден, создаю новый.", SETTINGS_FILE)
        return save_settings(get_default_settings())
    try:
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            loaded_settings = json.load(f)

        default_settings = get_default_settings()
        missing_keys = False
        for key, value in default_settings.items():
            if key not in loaded_settings:
                loaded_settings[key] = value
                missing_keys = True

        if missing_keys:
            log.info("Обнаружены новые ключи настроек. Обновляю %s", SETTINGS_FILE)
            save_settings(loaded_settings)

        return loaded_settings

    except Exception as e:
        log.error("Критическая ошибка при чтении %s: %s. Загружаю настройки по умолчанию.", SETTINGS_FILE, e,
                  exc_info=True)
        return get_default_settings()


def save_settings(settings):
    """Сохраняет словарь настроек в JSON-файл."""
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=4, ensure_ascii=False)
        return settings
    except Exception as e:
        log.error("Не удалось сохранить настройки в %s: %s", SETTINGS_FILE, e, exc_info=True)
        return get_default_settings()