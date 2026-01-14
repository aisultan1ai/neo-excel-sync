import pandas as pd
import logging
from utils import extract_numbers_from_series

log = logging.getLogger(__name__)


def _perform_comparison(df1, df2, id_col_1, acc_col_1, id_col_2, acc_col_2):
    log.debug("Выполнение _perform_comparison...")

    df1["cleaned_id"] = (
        df1[id_col_1].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
    )
    df2["cleaned_id"] = (
        df2[id_col_2].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
    )

    ids1 = set(df1["cleaned_id"])
    ids2 = set(df2["cleaned_id"])

    matching = df1[df1["cleaned_id"].isin(ids2)].copy()
    unmatched1 = df1[~df1["cleaned_id"].isin(ids2)].copy()
    unmatched2 = df2[~df2["cleaned_id"].isin(ids1)].copy()

    for df in [matching, unmatched1, unmatched2]:
        df.drop(columns=["cleaned_id"], inplace=True, errors="ignore")

    # Сводка
    count1 = pd.Series()
    if not df1.empty and acc_col_1 in df1.columns:
        count1 = df1.groupby(extract_numbers_from_series(df1[acc_col_1]))[
            id_col_1
        ].count()

    count2 = pd.Series()
    if not df2.empty and acc_col_2 in df2.columns:
        count2 = df2.groupby(extract_numbers_from_series(df2[acc_col_2]))[
            id_col_2
        ].count()

    return matching, unmatched1, unmatched2, count1, count2


def _process_podft_for_df(df, display_name, podft_settings):
    """Хелпер для поиска сделок ПОД/ФТ (7М)."""
    if df.empty:
        return pd.DataFrame()

    try:
        threshold_val = str(podft_settings.get("threshold", "7000000"))
        podft_threshold = float(threshold_val.replace(" ", "").replace(",", "."))
    except ValueError:
        log.error(f"Неверный формат порога ПОД/ФТ: {podft_settings.get('threshold')}")
        return pd.DataFrame()

    podft_column = podft_settings["column"]
    if podft_column not in df.columns:
        log.warning(
            f"Столбец для ПОД/ФТ (7М) '{podft_column}' не найден в {display_name}."
        )
        return pd.DataFrame()

    temp_df = df.copy()

    temp_df["__temp_sum"] = pd.to_numeric(
        temp_df[podft_column]
        .astype(str)
        .str.replace(r"\s+", "", regex=True)
        .str.replace(",", "."),
        errors="coerce",
    )

    result_df = temp_df[temp_df["__temp_sum"] >= podft_threshold].copy()
    result_df.drop(columns=["__temp_sum"], inplace=True)

    if podft_settings.get("filter_enabled"):
        filter_col = podft_settings.get("filter_column")
        filter_vals = podft_settings.get("filter_values", "")

        if filter_col and filter_vals and filter_col in result_df.columns:
            exclude_list = [
                v.strip().upper() for v in filter_vals.split(",") if v.strip()
            ]
            if exclude_list:
                mask = (
                    result_df[filter_col]
                    .astype(str)
                    .str.strip()
                    .str.upper()
                    .isin(exclude_list)
                )
                result_df = result_df[~mask]

    if not result_df.empty:
        result_df.insert(0, "Источник_Файла", display_name)

    return result_df


def process_files(
    file1_path,
    id_col_1,
    acc_col_1,
    file2_path,
    id_col_2,
    acc_col_2,
    podft_settings,
    overlap_accounts_list,
    display_name1="File1.xlsx",
    display_name2="File2.xlsx",
):
    """Основная функция обработки."""

    log.info(
        f"Начало основной обработки. Файл 1: {display_name1}, Файл 2: {display_name2}"
    )

    try:
        df1_orig = pd.read_excel(file1_path, dtype=str)
        df2_orig = pd.read_excel(file2_path, dtype=str)

        df1_orig.columns = df1_orig.columns.str.strip()
        df2_orig.columns = df2_orig.columns.str.strip()

        log.info(
            f"Файлы Excel успешно прочитаны. df1: {len(df1_orig)} строк, df2: {len(df2_orig)} строк."
        )

        if id_col_1 in df1_orig.columns:
            df1_orig.dropna(subset=[id_col_1], inplace=True)
        if id_col_2 in df2_orig.columns:
            df2_orig.dropna(subset=[id_col_2], inplace=True)

        #  Поиск дубликатов

        duplicates1 = pd.DataFrame()
        if id_col_1 in df1_orig.columns:
            s_ids = df1_orig[id_col_1].str.strip().str.replace(r"\.0$", "", regex=True)
            mask = s_ids.duplicated(keep=False) & s_ids.notna() & (s_ids != "")
            duplicates1 = df1_orig[mask].sort_values(by=id_col_1)

        log.info(f"Найдено {len(duplicates1)} задвоенных ID в df1.")

        duplicates2 = pd.DataFrame()
        if id_col_2 in df2_orig.columns:
            s_ids = df2_orig[id_col_2].str.strip().str.replace(r"\.0$", "", regex=True)
            mask = s_ids.duplicated(keep=False) & s_ids.notna() & (s_ids != "")
            duplicates2 = df2_orig[mask].sort_values(by=id_col_2)

        log.info(f"Найдено {len(duplicates2)} задвоенных ID в df2.")

        # Крипто (USDT)

        crypto_dfs = []
        inst_col = "Финансовый инструмент"

        for df, d_name in [(df1_orig, display_name1), (df2_orig, display_name2)]:
            if "Валюта" in df.columns:
                # Ищем USDT
                crypto = df[df["Валюта"] == "USDT"].copy()
                # Фильтр фьючерсов (FU...)
                if not crypto.empty and inst_col in crypto.columns:
                    crypto = crypto[~crypto[inst_col].astype(str).str.startswith("FU")]

                if not crypto.empty:
                    crypto.insert(0, "Источник_Файла", d_name)
                    crypto_dfs.append(crypto)

        crypto_res = (
            pd.concat(crypto_dfs, ignore_index=True) if crypto_dfs else pd.DataFrame()
        )
        log.info(f"Найдено {len(crypto_res)} сделок КРИПТО (USDT).")

        #  Бонды / Опционы (45M)

        bo_res = pd.DataFrame()
        bo_thresh_str = str(podft_settings.get("bo_threshold", "45000000"))

        if podft_settings.get("bo_enabled", True):
            inst_col_unity = podft_settings.get("bo_unity_instrument_col", "Instrument")
            sum_col_ais = podft_settings.get("bo_ais_sum_col", "Сумма тг")
            prefixes = [
                p.strip()
                for p in podft_settings.get("bo_prefixes", "[BO],[OP]").split(",")
            ]

            try:
                bo_thresh = float(bo_thresh_str.replace(" ", "").replace(",", "."))

                if inst_col_unity in df1_orig.columns and id_col_1 in df1_orig.columns:
                    # Ищем в Unity сделки с префиксами
                    mask = (
                        df1_orig[inst_col_unity]
                        .astype(str)
                        .str.startswith(tuple(prefixes))
                    )
                    bo_unity = df1_orig[mask]

                    if not bo_unity.empty:
                        target_ids = set(
                            bo_unity[id_col_1]
                            .astype(str)
                            .str.strip()
                            .str.replace(r"\.0$", "", regex=True)
                        )

                        if (
                            id_col_2 in df2_orig.columns
                            and sum_col_ais in df2_orig.columns
                        ):
                            ais_ids = (
                                df2_orig[id_col_2]
                                .astype(str)
                                .str.strip()
                                .str.replace(r"\.0$", "", regex=True)
                            )
                            bo_ais = df2_orig[ais_ids.isin(target_ids)].copy()

                            bo_ais["__sum"] = pd.to_numeric(
                                bo_ais[sum_col_ais], errors="coerce"
                            )
                            bo_res = bo_ais[bo_ais["__sum"] >= bo_thresh].copy()
                            bo_res.drop(columns=["__sum"], inplace=True)
            except Exception as e:
                log.error(f"Ошибка БО: {e}")

        log.info(f"Найдено {len(bo_res)} сделок Бонды/Опционы (>= {bo_thresh_str}).")

        #  Перекрытия

        overlap_set = set(overlap_accounts_list)
        found_overlaps = set()

        def get_accs(df, col):
            if col in df.columns:
                return extract_numbers_from_series(df[col])
            return pd.Series(dtype=object)

        accs1 = get_accs(df1_orig, acc_col_1)
        accs2 = get_accs(df2_orig, acc_col_2)

        if not accs1.empty:
            found_overlaps.update(set(accs1.dropna()) & overlap_set)
        if not accs2.empty:
            found_overlaps.update(set(accs2.dropna()) & overlap_set)

        log.info(
            f"Найдено {len(found_overlaps)} уникальных счетов 'перекрытия' в файлах."
        )

        len1_before = len(df1_orig)
        len2_before = len(df2_orig)

        df1_clean = (
            df1_orig[~accs1.isin(overlap_set)].copy()
            if not accs1.empty
            else df1_orig.copy()
        )
        df2_clean = (
            df2_orig[~accs2.isin(overlap_set)].copy()
            if not accs2.empty
            else df2_orig.copy()
        )

        log.info(f"Фильтрация df1: {len1_before} -> {len(df1_clean)} строк.")
        log.info(f"Фильтрация df2: {len2_before} -> {len(df2_clean)} строк.")

        #  ПОД/ФТ (7М)

        podft_res = pd.concat(
            [
                _process_podft_for_df(df1_clean, display_name1, podft_settings),
                _process_podft_for_df(df2_clean, display_name2, podft_settings),
            ],
            ignore_index=True,
        )

        thresh_disp = podft_settings.get("threshold")
        log.info(f"Найдено {len(podft_res)} сделок ПОД/ФТ ({thresh_disp}).")

        #  Основная сверка

        matches, diff1, diff2, sum1, sum2 = _perform_comparison(
            df1_clean, df2_clean, id_col_1, acc_col_1, id_col_2, acc_col_2
        )

        log.info(
            f"Сравнение завершено. Совпадений: {len(matches)}, Расхождений Unity: {len(diff1)}, Расхождений АИС: {len(diff2)}"
        )
        log.info("Обработка файлов в processor.py успешно завершена.")

        return {
            "matches": matches,
            "unmatched1": diff1,
            "unmatched2": diff2,
            "summary1": sum1,
            "summary2": sum2,
            "podft_7m_deals": podft_res,
            "podft_45m_bo_deals": bo_res,
            "crypto_deals": crypto_res,
            "duplicates1": duplicates1,
            "duplicates2": duplicates2,
        }, found_overlaps

    except Exception as e:
        log.error(f"Критическая ошибка в process_files: {e}", exc_info=True)
        raise e
