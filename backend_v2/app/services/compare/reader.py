import os
import pandas as pd


def read_table(file_path: str) -> pd.DataFrame:
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".csv":
        df = pd.read_csv(file_path, dtype=str, sep=None, engine="python")
    else:
        df = pd.read_excel(file_path, dtype=str)

    df.columns = df.columns.astype(str).str.strip()
    return df