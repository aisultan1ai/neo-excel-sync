import pandas as pd

from app.services.compare.helpers import clean_id_series


def find_duplicates(df: pd.DataFrame, id_col: str) -> pd.DataFrame:
    if id_col not in df.columns:
        return pd.DataFrame()

    ids = clean_id_series(df[id_col])
    mask = ids.duplicated(keep=False) & ids.notna() & (ids != "")
    return df[mask].copy().sort_values(by=id_col)