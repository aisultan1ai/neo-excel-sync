import logging
from typing import Optional

from psycopg2.extras import RealDictCursor

from core.database import get_db_connection, to_jsonb

log = logging.getLogger(__name__)


def create_upload(user_id: int, username: str, mode: str, period_end: Optional[str],
                  source_path: str, source_filename: str, commentary: Optional[str],
                  meta: dict) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO investor_report_uploads
                    (uploaded_by_user_id, uploaded_by_username, mode, period_end,
                     source_path, source_filename, commentary, status, meta)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (user_id, username, mode, period_end, source_path, source_filename,
                 commentary, 'ready', to_jsonb(meta or {})),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception as e:
        log.error("create_upload error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def add_file(upload_id: int, investor_name: str, docx_path: str, data: dict) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO investor_report_files
                    (upload_id, investor_name, docx_path, data)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (upload_id, investor_name, docx_path, to_jsonb(data or {})),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception as e:
        log.error("add_file error: %s", e, exc_info=True)
        conn.rollback()
        return None
    finally:
        conn.close()


def list_uploads(limit: int = 200) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT u.*,
                       (SELECT COUNT(*) FROM investor_report_files f WHERE f.upload_id = u.id) AS files_count
                FROM investor_report_uploads u
                ORDER BY u.uploaded_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_upload(upload_id: int) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM investor_report_uploads WHERE id = %s", (upload_id,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def list_files(upload_id: int) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM investor_report_files WHERE upload_id = %s ORDER BY id",
                (upload_id,),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_file(file_id: int) -> Optional[dict]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM investor_report_files WHERE id = %s", (file_id,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def delete_upload(upload_id: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM investor_report_uploads WHERE id = %s", (upload_id,))
        conn.commit()
        return True
    except Exception as e:
        log.error("delete_upload error: %s", e, exc_info=True)
        conn.rollback()
        return False
    finally:
        conn.close()
