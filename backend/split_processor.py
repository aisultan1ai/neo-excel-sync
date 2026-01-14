import pandas as pd
import logging
import os

log = logging.getLogger(__name__)


def read_split_file(file_path):
    """
    Читает файл (CSV или Excel), оптимизировано.
    """
    log.debug("Чтение файла: %s", file_path)
    try:
        if file_path.endswith(".csv"):
            return pd.read_csv(file_path)
        else:
            return pd.read_excel(file_path)
    except Exception as e:
        log.error("Не удалось прочитать файл %s: %s", file_path, e)
        return None


def find_splits(daily_file_path, settings):
    """
    Главная функция для поиска сплитов.
    Возвращает (True, DataFrame_совпадений) или (False, "текст_ошибки").
    """

    if not settings.get("split_check_enabled"):
        return (True, pd.DataFrame())

    split_file_path = settings.get("split_list_path")

    split_isin_col = settings.get("split_list_isin_col")
    daily_security_col = settings.get("daily_file_security_col")
    daily_acc_col = settings.get("default_acc_name_ais")
    daily_qty_col = settings.get("split_daily_qty_col")

    if not all(
        [
            split_file_path,
            split_isin_col,
            daily_security_col,
            daily_acc_col,
            daily_qty_col,
        ]
    ):
        msg = "Проверка сплитов включена, но не все настройки заполнены (Путь/Столбцы) в Настройках."
        log.warning(msg)
        return (False, msg)

    if not os.path.exists(split_file_path):
        msg = f"Файл сплитов не найден по пути: {split_file_path}"
        log.error(msg)
        return (False, msg)

    if not os.path.exists(daily_file_path):
        msg = f"Ежедневный файл не найден по пути: {daily_file_path}"
        log.error(msg)
        return (False, msg)

    try:
        df_splits = read_split_file(split_file_path)
        if df_splits is None:
            return (False, "Не удалось прочитать файл сплитов.")

        df_daily = read_split_file(daily_file_path)
        if df_daily is None:
            return (False, "Не удалось прочитать ежедневный файл.")

        if split_isin_col not in df_splits.columns:
            return (False, f"Столбец '{split_isin_col}' не найден в файле сплитов.")

        required_daily_cols = [daily_security_col, daily_acc_col, daily_qty_col]
        missing_cols = [
            col for col in required_daily_cols if col not in df_daily.columns
        ]
        if missing_cols:
            return (
                False,
                f"Столбцы {missing_cols} не найдены в ежедневном файле (АИС).",
            )

        split_isin_set = set(df_splits[split_isin_col].dropna().astype(str))
        df_daily["ISIN_clean"] = (
            df_daily[daily_security_col]
            .dropna()
            .astype(str)
            .str.extract(r"^([A-Z0-9]+)")[0]
        )

        df_matches = df_daily[df_daily["ISIN_clean"].isin(split_isin_set)].copy()

        if df_matches.empty:
            log.debug("Сплиты не обнаружены.")
            return (True, pd.DataFrame())

        log.info("Обнаружено %d сделок со сплитами.", len(df_matches))

        df_report = df_matches[
            ["ISIN_clean", daily_acc_col, daily_qty_col, daily_security_col]
        ]

        df_report = df_report.rename(
            columns={
                "ISIN_clean": "ISIN",
                daily_acc_col: "Счет",
                daily_qty_col: "Количество",
                daily_security_col: "Полное название ЦБ",
            }
        )

        return (True, df_report)

    except Exception as e:
        log.error("Ошибка при проверке сплитов: %s", e, exc_info=True)
        return (False, f"Ошибка при проверке сплитов: {e}")
