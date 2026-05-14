import os
from pathlib import Path

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

# Absolute path relative to this file so it works regardless of cwd
_BACKEND_DIR = Path(__file__).resolve().parent.parent
TEMP_DIR = str(_BACKEND_DIR / "temp_uploads")

CACHE_TTL_MINUTES = int(os.getenv("CACHE_TTL_MINUTES", "30"))
CACHE_MAX_ITEMS = int(os.getenv("CACHE_MAX_ITEMS", "15"))
