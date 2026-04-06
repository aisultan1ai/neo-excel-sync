import pandas as pd

from app.services.compare.helpers import clean_id_series


def process_bo_deals(
    df1_orig: pd.DataFrame,
    df2_orig: pd.DataFrame,
    id_col_1: str,
    id_col_2: str,
    settings: dict,
) -> pd.DataFrame:
    bo_res = pd.DataFrame()

    if not settings.get("bo_enabled", True):
        return bo_res

    inst_col_unity = settings.get("bo_unity_instrument_col", "Instrument")
    sum_col_ais = settings.get("bo_ais_sum_col", "Сумма тг")
    prefixes = [p.strip() for p in settings.get("bo_prefixes", "[BO],[OP]").split(",")]

    try:
        bo_thresh = float(str(settings.get("bo_threshold", "45000000")).replace(" ", "").replace(",", "."))
    except Exception:
        return bo_res

    if inst_col_unity not in df1_orig.columns or id_col_1 not in df1_orig.columns:
        return bo_res

    mask = df1_orig[inst_col_unity].astype(str).str.startswith(tuple(prefixes))
    bo_unity = df1_orig[mask]

    if bo_unity.empty:
        return bo_res

    target_ids = set(clean_id_series(bo_unity[id_col_1]))

    if id_col_2 not in df2_orig.columns or sum_col_ais not in df2_orig.columns:
        return bo_res

    ais_ids = clean_id_series(df2_orig[id_col_2])
    bo_ais = df2_orig[ais_ids.isin(target_ids)].copy()

    bo_ais["__sum"] = pd.to_numeric(bo_ais[sum_col_ais], errors="coerce")
    bo_res = bo_ais[bo_ais["__sum"] >= bo_thresh].copy()
    bo_res.drop(columns=["__sum"], inplace=True)

    return bo_res