import os


class Settings:
    APP_NAME = os.getenv("APP_NAME", "NeoExcelSync API V2")
    APP_ENV = os.getenv("APP_ENV", "development")
    APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
    APP_PORT = int(os.getenv("APP_PORT", "8000"))

    DB_HOST = os.getenv("DB_HOST", "db_v2")
    DB_PORT = int(os.getenv("DB_PORT", "5432"))
    POSTGRES_DB = os.getenv("POSTGRES_DB", "neo_v2")
    POSTGRES_USER = os.getenv("POSTGRES_USER", "neo_v2")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "neo_v2_pass")

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
    )

    INIT_ADMIN_USERNAME = os.getenv("INIT_ADMIN_USERNAME", "admin")
    INIT_ADMIN_PASSWORD = os.getenv("INIT_ADMIN_PASSWORD", "admin123")
    INIT_ADMIN_DEPARTMENT = os.getenv("INIT_ADMIN_DEPARTMENT", "Architecture Lab")
    INIT_ADMIN_IS_ADMIN = os.getenv("INIT_ADMIN_IS_ADMIN", "true").lower() in (
        "1",
        "true",
        "yes",
        "y",
    )

    STORAGE_ROOT = os.getenv("STORAGE_ROOT", "/app/storage")
    TASK_ATTACHMENTS_DIR = os.path.join(STORAGE_ROOT, "task_attachments")
    CLIENT_FILES_DIR = os.path.join(STORAGE_ROOT, "client_files")
    SETTINGS_DIR = os.path.join(STORAGE_ROOT, "settings")
    SETTINGS_FILE = os.path.join(SETTINGS_DIR, "app_settings.json")
    SPLITS_DIR = os.path.join(STORAGE_ROOT, "splits")
    TEMP_DIR = os.path.join(STORAGE_ROOT, "temp")

    CACHE_TTL_MINUTES = int(os.getenv("CACHE_TTL_MINUTES", "30"))
    CACHE_MAX_ITEMS = int(os.getenv("CACHE_MAX_ITEMS", "15"))


settings = Settings()