import psycopg2
from app.core.config import settings


def get_db_connection():
    return psycopg2.connect(
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.DB_HOST,
        port=settings.DB_PORT,
    )