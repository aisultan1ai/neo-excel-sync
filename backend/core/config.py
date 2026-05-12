import os

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

TEMP_DIR = "temp_uploads"
CACHE_TTL_MINUTES = int(os.getenv("CACHE_TTL_MINUTES", "30"))
CACHE_MAX_ITEMS = int(os.getenv("CACHE_MAX_ITEMS", "15"))
