import pandas as pd
import os
import logging
from utils import extract_numbers_from_series
log = logging.getLogger(__name__)


def _perform_comparison(df1, df2, id_col_1, acc_col_1, id_col_2, acc_col_2):
    # ... (код не меняется) ...
    log.debug("Выполнение _perform_comparison...")
    df1['cleaned_id'] = df1[id_col_1].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
    df2['cleaned_id'] = df2[id_col_2].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
    matching = df1[df1['cleaned_id'].isin(df2['cleaned_id'])].copy()
    unmatched1 = df1[~df1['cleaned_id'].isin(df2['cleaned_id'])].copy()
    unmatched2 = df2[~df2['cleaned_id'].isin(df1['cleaned_id'])].copy()
    for df in [matching, unmatched1, unmatched2]:
        df.drop(columns=['cleaned_id'], inplace=True, errors='ignore')
    count1 = df1.groupby(extract_numbers_from_series(df1[acc_col_1]))[
        id_col_1].count() if not df1.empty else pd.Series()
    count2 = df2.groupby(extract_numbers_from_series(df2[acc_col_2]))[
        id_col_2].count() if not df2.empty else pd.Series()
    log.debug("Сравнение завершено. Найдено: %d совпадений, %d расх. Unity, %d расх. АИС", len(matching),
              len(unmatched1), len(unmatched2))
    return matching, unmatched1, unmatched2, count1, count2


def _process_podft_for_df(df, file_path, podft_settings):
    """Хелпер для поиска сделок ПОД/ФТ (7М) в одном DataFrame."""
    log.debug("Поиск ПОД/ФТ (7М) в %s...", os.path.basename(file_path))
    try:
        podft_threshold = float(podft_settings['threshold'].replace(' ', '').replace(',', '.'))
    except ValueError:
        log.error("Неверный формат порогового значения ПОД/ФТ (7М): %s", podft_settings['threshold'], exc_info=True)
        raise ValueError("Пороговое значение для ПОД/ФТ (7М) должно быть числом.")

    podft_column = podft_settings['column']
    if podft_column not in df.columns:
        log.warning("Столбец для ПОД/ФТ (7М) '%s' не найден в %s.", podft_column, os.path.basename(file_path))
        return pd.DataFrame()

    df_numeric = pd.to_numeric(df[podft_column], errors='coerce')
    temp_df = df.loc[df_numeric >= podft_threshold].copy()
    log.debug("Найдено %d сделок (7М) >= %f (до фильтра)", len(temp_df), podft_threshold)

    if podft_settings['filter_enabled']:
        filter_col = podft_settings['filter_column']
        filter_vals_str = podft_settings['filter_values']
        if filter_col and filter_vals_str and filter_col in temp_df.columns:
            exclude_list = [val.strip().upper() for val in filter_vals_str.split(',')]

            # --- !! ВОТ ИСПРАВЛЕНИЕ !! ---
            # Мы добавляем .str.strip() для очистки данных из Excel
            temp_df = temp_df[~temp_df[filter_col].astype(str).str.strip().str.upper().isin(exclude_list)]
            # --- !! КОНЕЦ ИСПРАВЛЕНИЯ !! ---

            log.debug("Применен фильтр-исключение (7М). Осталось %d сделок.", len(temp_df))

    if not temp_df.empty:
        temp_df.insert(0, 'Источник_Файла', os.path.basename(file_path))

    log.debug("Поиск ПОД/ФТ (7М) в %s завершен. Найдено: %d", os.path.basename(file_path), len(temp_df))
    return temp_df


def process_files(file1_path, id_col_1, acc_col_1, file2_path, id_col_2, acc_col_2,
                  podft_settings,
                  overlap_accounts_list_from_settings):
    """
    Основная логика сравнения и проверок.
    (Весь остальной код НЕ МЕНЯЕТСЯ)
    """
    log.info("Начало основной обработки. Файл 1: %s, Файл 2: %s", os.path.basename(file1_path),
             os.path.basename(file2_path))

    try:
        log.debug("Чтение Excel файла 1: %s", file1_path)
        df1_original = pd.read_excel(file1_path)
        log.debug("Чтение Excel файла 2: %s", file2_path)
        df2_original = pd.read_excel(file2_path)
        log.info("Файлы Excel успешно прочитаны. df1: %d строк, df2: %d строк.", len(df1_original), len(df2_original))

        df1_cols = df1_original.columns.tolist() if not df1_original.empty else []
        df2_cols = df2_original.columns.tolist() if not df2_original.empty else []

        try:
            if id_col_1 in df1_original.columns and acc_col_1 in df1_original.columns:
                df1_original = df1_original.dropna(subset=[id_col_1, acc_col_1], how='all')
            if id_col_2 in df2_original.columns and acc_col_2 in df2_original.columns:
                df2_original = df2_original.dropna(subset=[id_col_2, acc_col_2], how='all')
            log.debug("Очистка 'Итоговых' строк завершена.")
        except Exception as e:
            log.warning("Ошибка при очистке итоговых строк: %s", e)

        # --- Поиск задвоенных ID (с "очисткой") ---
        log.debug("Поиск задвоенных ID в df1...")
        duplicates_df1 = pd.DataFrame()
        duplicates_df2 = pd.DataFrame()
        temp_id_col = 'temp_cleaned_id_for_dup_check'
        if id_col_1 in df1_original.columns:
            df1_original[temp_id_col] = df1_original[id_col_1].astype(str).str.strip().str.replace(r'\.0$', '',
                                                                                                   regex=True)
            duplicated_mask_1 = df1_original.duplicated(subset=[temp_id_col], keep=False) & df1_original[
                temp_id_col].notna() & (df1_original[temp_id_col] != '')
            duplicates_df1 = df1_original[duplicated_mask_1].copy()
            df1_original.drop(columns=[temp_id_col], inplace=True)
            duplicates_df1.drop(columns=[temp_id_col], inplace=True, errors='ignore')
            if not duplicates_df1.empty:
                duplicates_df1 = duplicates_df1.sort_values(by=id_col_1)
        log.info("Найдено %d задвоенных ID в df1.", len(duplicates_df1))
        log.debug("Поиск задвоенных ID в df2...")
        if id_col_2 in df2_original.columns:
            df2_original[temp_id_col] = df2_original[id_col_2].astype(str).str.strip().str.replace(r'\.0$', '',
                                                                                                   regex=True)
            duplicated_mask_2 = df2_original.duplicated(subset=[temp_id_col], keep=False) & df2_original[
                temp_id_col].notna() & (df2_original[temp_id_col] != '')
            duplicates_df2 = df2_original[duplicated_mask_2].copy()
            df2_original.drop(columns=[temp_id_col], inplace=True)
            duplicates_df2.drop(columns=[temp_id_col], inplace=True, errors='ignore')
            if not duplicates_df2.empty:
                duplicates_df2 = duplicates_df2.sort_values(by=id_col_2)
        log.info("Найдено %d задвоенных ID в df2.", len(duplicates_df2))

        # --- Блок КРИПТО (USDT) ---
        log.debug("Поиск сделок КРИПТО (USDT)...")
        all_crypto_deals = []

        # --- !! НАЧАЛО ИЗМЕНЕНИЙ !! ---
        # Имя столбца для FU-фильтра
        instrument_col_name = "Финансовый инструмент"

        if 'Валюта' in df1_original.columns:
            # 1. Сначала находим все USDT
            crypto1_base = df1_original[df1_original['Валюта'] == 'USDT'].copy()

            # 2. Теперь, если столбец "Финансовый инструмент" существует,
            #    применяем к ним FU-фильтр
            if not crypto1_base.empty and instrument_col_name in crypto1_base.columns:
                # .astype(str) нужен для .str, чтобы избежать ошибок на NaN
                # ~ (тильда) означает "НЕ" (not)
                crypto1 = crypto1_base[~crypto1_base[instrument_col_name].astype(str).str.startswith("FU")].copy()
            else:
                # Если столбца нет, просто берем все, что нашли (старая логика)
                crypto1 = crypto1_base

            # 3. Добавляем в общий список, если что-то осталось
            if not crypto1.empty:
                crypto1.insert(0, 'Источник_Файла', os.path.basename(file1_path))
                all_crypto_deals.append(crypto1)

        # Повторяем то же самое для df2
        if 'Валюта' in df2_original.columns:
            # 1. Находим USDT
            crypto2_base = df2_original[df2_original['Валюта'] == 'USDT'].copy()

            # 2. Применяем FU-фильтр
            if not crypto2_base.empty and instrument_col_name in crypto2_base.columns:
                crypto2 = crypto2_base[~crypto2_base[instrument_col_name].astype(str).str.startswith("FU")].copy()
            else:
                crypto2 = crypto2_base

            # 3. Добавляем в общий список
            if not crypto2.empty:
                crypto2.insert(0, 'Источник_Файла', os.path.basename(file2_path))
                all_crypto_deals.append(crypto2)

        # --- !! КОНЕЦ ИЗМЕНЕНИЙ !! ---

        crypto_deals_df = pd.concat(all_crypto_deals, ignore_index=True) if all_crypto_deals else pd.DataFrame()
        if crypto_deals_df.empty:
            base_cols = df1_cols if df1_cols else df2_cols
            if base_cols:
                final_cols = base_cols.copy()
                if 'Источник_Файла' not in final_cols:
                    final_cols.insert(0, 'Источник_Файла')
                crypto_deals_df = pd.DataFrame(columns=final_cols)
            else:
                crypto_deals_df = pd.DataFrame(columns=['Источник_Файла', 'Валюта', 'Сумма тг'])
        log.info("Найдено %d сделок КРИПТО (USDT).", len(crypto_deals_df))

        # --- Блок ПОДФТ Бонды/Опционы (45M) ---
        log.debug("Поиск сделок Бонды/Опционы (45М)...")
        bonds_options_df = pd.DataFrame()
        if podft_settings.get('bo_enabled', True):
            try:
                instrument_col_1 = podft_settings.get("bo_unity_instrument_col", "Instrument")
                bo_threshold_str = podft_settings.get("bo_threshold", "45000000")
                bo_sum_col = podft_settings.get("bo_ais_sum_col", "Сумма тг")
                prefixes_str = podft_settings.get("bo_prefixes", "[BO],[OP]")
                log.debug("Настройки Б/О: Col1='%s', Thresh='%s', SumCol='%s', Prefixes='%s'",
                          instrument_col_1, bo_threshold_str, bo_sum_col, prefixes_str)
                bo_threshold = float(bo_threshold_str.replace(' ', '').replace(',', '.'))
                prefixes_list = [p.strip() for p in prefixes_str.split(',') if p.strip()]
                if instrument_col_1 in df1_original.columns and id_col_1 in df1_original.columns:
                    df1_targets_list = []
                    for prefix in prefixes_list:
                        log.debug("Поиск префикса: %s", prefix)
                        df1_targets_list.append(
                            df1_original[df1_original[instrument_col_1].astype(str).str.startswith(prefix)])
                    if df1_targets_list:
                        df1_targets = pd.concat(df1_targets_list)
                    else:
                        df1_targets = pd.DataFrame(
                            columns=df1_original.columns)
                    log.debug("Найдено %d сделок (Б/О) в Unity по префиксам.", len(df1_targets))
                    if not df1_targets.empty:
                        target_ids = df1_targets[id_col_1].astype(str).str.strip().str.replace(r'\.0$', '',
                                                                                               regex=True).unique()
                        if id_col_2 in df2_original.columns and bo_sum_col in df2_original.columns:
                            df2_copy = df2_original.copy()
                            df2_copy['cleaned_id_bo'] = df2_copy[id_col_2].astype(str).str.strip().str.replace(r'\.0$',
                                                                                                               '',
                                                                                                               regex=True)
                            df2_matches = df2_copy[df2_copy['cleaned_id_bo'].isin(target_ids)].copy()
                            log.debug("Найдено %d совпадений по ID (Б/О) в АИС.", len(df2_matches))
                            if not df2_matches.empty:
                                df2_matches[bo_sum_col] = pd.to_numeric(df2_matches[bo_sum_col], errors='coerce')
                                bonds_options_df = df2_matches[df2_matches[bo_sum_col] >= bo_threshold].copy()
                            bonds_options_df.drop(columns=['cleaned_id_bo'], inplace=True, errors='ignore')
                log.info("Найдено %d сделок Бонды/Опционы (>= %s).", len(bonds_options_df), bo_threshold_str)
            except Exception as e:
                log.error("Ошибка при обработке Бондов/Опционов: %s", e, exc_info=True)
        else:
            log.info("Проверка Бондов/Опционов (45М) отключена в настройках.")
        if bonds_options_df.empty:
            bo_sum_col_name = podft_settings.get("bo_ais_sum_col", "Сумма тг")
            if df2_cols:
                bonds_options_df = pd.DataFrame(columns=df2_cols)
            else:
                bonds_options_df = pd.DataFrame(columns=[id_col_2, bo_sum_col_name])

        # --- Поиск Счетов "Перекрытия" ---
        log.debug("Поиск счетов 'перекрытия' (всего %d в списке)...", len(overlap_accounts_list_from_settings))
        overlap_accounts_set = set(overlap_accounts_list_from_settings)
        found_overlap_accounts = set()
        if acc_col_1 in df1_original.columns:
            extracted_accounts1 = extract_numbers_from_series(df1_original[acc_col_1])
            found_in_df1 = set(extracted_accounts1.dropna().unique()) & overlap_accounts_set
            found_overlap_accounts.update(found_in_df1)
        if acc_col_2 in df2_original.columns:
            extracted_accounts2 = extract_numbers_from_series(df2_original[acc_col_2])
            found_in_df2 = set(extracted_accounts2.dropna().unique()) & overlap_accounts_set
            found_overlap_accounts.update(found_in_df2)
        log.info("Найдено %d уникальных счетов 'перекрытия' в файлах.", len(found_overlap_accounts))

        # --- Фильтрация Счетов "Перекрытия" ---
        log.debug("Фильтрация счетов 'перекрытия' из основных DF...")
        df1 = df1_original.copy()
        df2 = df2_original.copy()
        df1_len_before = len(df1)
        df2_len_before = len(df2)
        if acc_col_1 in df1.columns:
            df1 = df1[~extract_numbers_from_series(df1[acc_col_1]).isin(overlap_accounts_set)].copy()
        if acc_col_2 in df2.columns:
            df2 = df2[~extract_numbers_from_series(df2[acc_col_2]).isin(overlap_accounts_set)].copy()
        log.info("Фильтрация df1: %d -> %d строк.", df1_len_before, len(df1))
        log.info("Фильтрация df2: %d -> %d строк.", df2_len_before, len(df2))

        # --- Поиск ПОДФТ (7М) ---
        log.debug("Поиск ПОД/ФТ (%s) по отфильтрованным данным...", podft_settings.get('threshold'))
        podft_results = pd.DataFrame()
        if podft_settings['column'] and podft_settings['threshold']:
            podft_results = pd.concat([
                _process_podft_for_df(df1, file1_path, podft_settings),
                _process_podft_for_df(df2, file2_path, podft_settings)
            ])

        log.info("Найдено %d сделок ПОД/ФТ (%s).", len(podft_results), podft_settings.get('threshold'))

        # --- Основное сравнение ---
        log.debug("Запуск основного сравнения...")
        matching, unmatched1, unmatched2, count1, count2 = _perform_comparison(df1, df2, id_col_1, acc_col_1,
                                                                               id_col_2, acc_col_2)

        # --- Сборка результатов ---
        log.debug("Сборка финального словаря результатов.")
        results_to_export = {
            'matches': matching, 'unmatched1': unmatched1, 'unmatched2': unmatched2,
            'summary1': count1, 'summary2': count2,
            'podft_7m_deals': podft_results,
            'podft_45m_bo_deals': bonds_options_df,
            'crypto_deals': crypto_deals_df,
            'duplicates1': duplicates_df1,
            'duplicates2': duplicates_df2
        }

        log.info("Обработка файлов в processor.py успешно завершена.")
        return results_to_export, found_overlap_accounts

    except Exception as e:
        log.error("Критическая ошибка в process_files: %s", e, exc_info=True)
        raise e