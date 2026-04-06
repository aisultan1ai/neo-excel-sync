import pandas as pd


def extract_numbers_from_series(series: pd.Series) -> pd.Series:
    return series.astype(str).str.extract(r"(\d+)")[0].fillna("")


def clean_id_series(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
    )