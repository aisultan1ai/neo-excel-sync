import pandas as pd

from app.services.compare.reader import read_table
from app.services.compare.duplicate_detector import find_duplicates
from app.services.compare.overlap_filter import filter_overlap_accounts
from app.services.compare.matcher import perform_comparison
from app.services.compare.podft_service import process_podft_for_df
from app.services.compare.bo_service import process_bo_deals
from app.services.compare.crypto_service import collect_initial_crypto, postprocess_crypto


def run_compare(
    file1_path: str,
    id_col_1: str,
    acc_col_1: str,
    file2_path: str,
    id_col_2: str,
    acc_col_2: str,
    settings: dict,
    display_name1: str,
    display_name2: str,
):
    df1_orig = read_table(file1_path)
    df2_orig = read_table(file2_path)

    if id_col_1 in df1_orig.columns:
        df1_orig.dropna(subset=[id_col_1], inplace=True)
    if id_col_2 in df2_orig.columns:
        df2_orig.dropna(subset=[id_col_2], inplace=True)

    duplicates1 = find_duplicates(df1_orig, id_col_1)
    duplicates2 = find_duplicates(df2_orig, id_col_2)

    crypto_initial = collect_initial_crypto(df1_orig, df2_orig, display_name1, display_name2)

    bo_settings = {
        "bo_enabled": settings.get("bo_enabled", True),
        "bo_unity_instrument_col": settings.get("bo_unity_instrument_col", "Instrument"),
        "bo_ais_sum_col": settings.get("bo_ais_sum_col", "Сумма тг"),
        "bo_threshold": settings.get("bo_threshold", "45000000"),
        "bo_prefixes": settings.get("bo_prefixes", "[BO], [OP]"),
    }

    bo_res = process_bo_deals(
        df1_orig=df1_orig,
        df2_orig=df2_orig,
        id_col_1=id_col_1,
        id_col_2=id_col_2,
        settings=bo_settings,
    )

    overlap_accounts = settings.get("overlap_accounts", []) or []
    df1_clean, df2_clean, found_overlaps = filter_overlap_accounts(
        df1_orig,
        acc_col_1,
        df2_orig,
        acc_col_2,
        overlap_accounts,
    )

    podft_settings = {
        "column": settings.get("podft_sum_col", "Сумма тг"),
        "threshold": settings.get("podft_threshold", "7000000"),
        "filter_enabled": settings.get("podft_filter_enabled", True),
        "filter_column": settings.get("podft_filter_col", "Рынок ЦБ"),
        "filter_values": settings.get("podft_filter_values", ""),
    }

    podft_res = pd.concat(
        [
            process_podft_for_df(df1_clean, display_name1, podft_settings),
            process_podft_for_df(df2_clean, display_name2, podft_settings),
        ],
        ignore_index=True,
    )

    matches, diff1, diff2, sum1, sum2 = perform_comparison(
        df1_clean,
        df2_clean,
        id_col_1,
        acc_col_1,
        id_col_2,
        acc_col_2,
    )

    crypto_res = postprocess_crypto(crypto_initial, settings)

    results = {
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
        "found_overlaps": list(found_overlaps),
    }

    return results