import os
from pathlib import Path

BOT_TOKEN = os.environ["BOT_TOKEN"]
AUTH_TOKEN = os.environ["AUTH_TOKEN"]

ACCOUNT_ID_DEFAULT = os.environ.get("ACCOUNT_ID") or None

CURRENCY_ID = int(os.environ.get("CURRENCY_ID") or "1")

API_BASE_URL = "https://rest.unity.finance/api/v1"
API_TIMEOUT = 30.0
DEFAULT_LIMIT = 200

TELEGRAM_MSG_LIMIT = 4096

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
STATE_FILE = DATA_DIR / "state.json"

def _parse_ids(raw: str | None) -> set[int]:
    if not raw:
        return set()
    result: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            result.add(int(part))
        except ValueError:
            pass
    return result


ALLOWED_USER_IDS: set[int] = _parse_ids(os.environ.get("ALLOWED_USER_IDS"))
