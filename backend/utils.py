import sys
import os


def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath("src")
    return os.path.join(base_path, relative_path)


def extract_numbers_from_series(series):
    return series.astype(str).str.extract(r"(\d+)")[0].fillna("")
