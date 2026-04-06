import pandas as pd


def process_podft_for_df(
    df: pd.DataFrame,
    display_name: str,
    podft_settings: dict,
) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    try:
        threshold_val = str(podft_settings.get("threshold", "7000000"))
        podft_threshold = float(threshold_val.replace(" ", "").replace(",", "."))
    except ValueError:
        return pd.DataFrame()

    podft_column = podft_settings["column"]
    if podft_column not in df.columns:
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
            exclude_list = [v.strip().upper() for v in filter_vals.split(",") if v.strip()]
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

    if "Рынок ЦБ" in result_df.columns:
        result_df = result_df[result_df["Рынок ЦБ"] != "MISX"]

    return result_df