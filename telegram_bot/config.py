"""Конфигурация из переменных окружения."""
import os

BOT_TOKEN = os.environ["BOT_TOKEN"]
AUTH_TOKEN = os.environ["AUTH_TOKEN"]
ACCOUNT_ID = os.environ.get("ACCOUNT_ID")  # необязательный

API_BASE_URL = "https://rest.unity.finance/api/v1"
API_TIMEOUT = 30.0
DEFAULT_LIMIT = 200

# Лимит Telegram на одно сообщение
TELEGRAM_MSG_LIMIT = 4096
