"""Конфигурация из переменных окружения."""
import os
from pathlib import Path

BOT_TOKEN = os.environ["BOT_TOKEN"]
AUTH_TOKEN = os.environ["AUTH_TOKEN"]

# Дефолтный accountId (используется если пользователь не задал свой через /setaccount).
# Можно оставить пустым — тогда фильтр по счёту не применится вовсе.
ACCOUNT_ID_DEFAULT = os.environ.get("ACCOUNT_ID") or None

API_BASE_URL = "https://rest.unity.finance/api/v1"
API_TIMEOUT = 30.0
DEFAULT_LIMIT = 200

# Лимит Telegram на одно сообщение
TELEGRAM_MSG_LIMIT = 4096

# Каталог для персистентных данных (кэш инструментов, настройки пользователей).
# В docker-compose.yml монтируется как named volume.
DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
STATE_FILE = DATA_DIR / "state.json"

# Whitelist разрешённых Telegram user_id (через запятую).
# Пустой список = никто, кроме /myid, не имеет доступа.
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
