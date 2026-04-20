import pandas as pd


def serialize_compare_results(results: dict, comparison_id: str | None = None) -> dict:
    json_response = {}

    for key, val in results.items():
        if isinstance(val, pd.DataFrame):
            json_response[key] = val.fillna("").to_dict(orient="records")
        elif isinstance(val, pd.Series):
            json_response[key] = val.to_dict()
        elif isinstance(val, set):
            json_response[key] = list(val)
        elif isinstance(val, list):
            json_response[key] = val
        else:
            json_response[key] = val

    json_response["status"] = "success"
    if comparison_id:
        json_response["comparison_id"] = comparison_id

    return json_response