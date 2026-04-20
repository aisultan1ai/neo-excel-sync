import re
import pandas as pd


def collect_initial_crypto(
    df1_orig: pd.DataFrame,
    df2_orig: pd.DataFrame,
    display_name1: str,
    display_name2: str,
) -> pd.DataFrame:
    crypto_dfs = []
    inst_col = "Финансовый инструмент"

    for df, d_name in [(df1_orig, display_name1), (df2_orig, display_name2)]:
        if "Валюта" in df.columns:
            crypto = df[df["Валюта"] == "USDT"].copy()

            if not crypto.empty and inst_col in crypto.columns:
                crypto = crypto[~crypto[inst_col].astype(str).str.startswith("FU")]

            if not crypto.empty:
                crypto.insert(0, "Источник_Файла", d_name)
                crypto_dfs.append(crypto)

    return pd.concat(crypto_dfs, ignore_index=True) if crypto_dfs else pd.DataFrame()


def postprocess_crypto(df_crypto: pd.DataFrame, settings: dict) -> pd.DataFrame:
    if df_crypto is None or df_crypto.empty:
        return pd.DataFrame()

    df_crypto = df_crypto.drop_duplicates().copy()

    inst_cols = [
        c for c in df_crypto.columns
        if "инструмент" in c.lower() or "instrument" in c.lower()
    ]
    if inst_cols:
        df_crypto = df_crypto[
            ~df_crypto[inst_cols[0]].astype(str).str.startswith("FU")
        ]

    sum_cols = [c for c in df_crypto.columns if "сумма" in c.lower() and "тг" in c.lower()]
    target_sum_col = "Сумма тг"

    def clean_sum(df: pd.DataFrame, col: str):
        temp_series = (
            df[col]
            .astype(str)
            .str.replace(r"\s+", "", regex=True)
            .str.replace(",", ".")
        )
        return pd.to_numeric(temp_series, errors="coerce")

    if target_sum_col in df_crypto.columns:
        df_crypto = df_crypto[clean_sum(df_crypto, target_sum_col) >= 5000000]
    elif sum_cols:
        df_crypto = df_crypto[clean_sum(df_crypto, sum_cols[0]) >= 5000000]

    crypto_keywords = settings.get("crypto_keywords", "")
    crypto_col = settings.get("crypto_col", "")

    if settings.get("crypto_enabled", False) and crypto_keywords and crypto_col:
        if crypto_col in df_crypto.columns:
            keywords = [k.strip().upper() for k in crypto_keywords.split(",") if k.strip()]
            pattern = "|".join([re.escape(k) for k in keywords])
            df_crypto = df_crypto[
                df_crypto[crypto_col]
                .astype(str)
                .str.upper()
                .str.contains(pattern, regex=True, na=False)
            ]

    return df_crypto