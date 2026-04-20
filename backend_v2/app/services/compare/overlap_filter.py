import pandas as pd

from app.services.compare.helpers import extract_numbers_from_series


def _get_accs(df: pd.DataFrame, col: str) -> pd.Series:
    if col in df.columns:
        return extract_numbers_from_series(df[col])
    return pd.Series(dtype=object)


def filter_overlap_accounts(
    df1: pd.DataFrame,
    acc_col_1: str,
    df2: pd.DataFrame,
    acc_col_2: str,
    overlap_accounts_list: list[str],
):
    overlap_set = {str(x).strip() for x in overlap_accounts_list if str(x).strip()}
    found_overlaps = set()

    accs1 = _get_accs(df1, acc_col_1)
    accs2 = _get_accs(df2, acc_col_2)

    if not accs1.empty:
        found_overlaps.update(set(accs1.dropna()) & overlap_set)
    if not accs2.empty:
        found_overlaps.update(set(accs2.dropna()) & overlap_set)

    df1_clean = df1[~accs1.isin(overlap_set)].copy() if not accs1.empty else df1.copy()
    df2_clean = df2[~accs2.isin(overlap_set)].copy() if not accs2.empty else df2.copy()

    return df1_clean, df2_clean, found_overlaps