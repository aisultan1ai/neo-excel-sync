import pandas as pd

from app.services.compare.helpers import clean_id_series, extract_numbers_from_series


def perform_comparison(
    df1: pd.DataFrame,
    df2: pd.DataFrame,
    id_col_1: str,
    acc_col_1: str,
    id_col_2: str,
    acc_col_2: str,
):
    df1 = df1.copy()
    df2 = df2.copy()

    df1["cleaned_id"] = clean_id_series(df1[id_col_1])
    df2["cleaned_id"] = clean_id_series(df2[id_col_2])

    ids1 = set(df1["cleaned_id"])
    ids2 = set(df2["cleaned_id"])

    matching = df1[df1["cleaned_id"].isin(ids2)].copy()
    unmatched1 = df1[~df1["cleaned_id"].isin(ids2)].copy()
    unmatched2 = df2[~df2["cleaned_id"].isin(ids1)].copy()

    for df in [matching, unmatched1, unmatched2]:
        df.drop(columns=["cleaned_id"], inplace=True, errors="ignore")

    count1 = pd.Series(dtype=int)
    if not df1.empty and acc_col_1 in df1.columns:
        count1 = df1.groupby(extract_numbers_from_series(df1[acc_col_1]))[id_col_1].count()

    count2 = pd.Series(dtype=int)
    if not df2.empty and acc_col_2 in df2.columns:
        count2 = df2.groupby(extract_numbers_from_series(df2[acc_col_2]))[id_col_2].count()

    return matching, unmatched1, unmatched2, count1, count2