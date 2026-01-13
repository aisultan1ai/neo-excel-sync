import shutil
import time
import re
import os
import json
import logging
import uuid
import bcrypt
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any
from threading import Lock

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from jose import JWTError, jwt
from excel_reconcile_single import register_excel_reconcile

import processor
import settings_manager
import split_processor
import excel_exporter
import database_manager

pd.set_option('future.no_silent_downcasting', True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    force=True
)
log = logging.getLogger(__name__)

app = FastAPI(title="NeoExcelSync API")

register_excel_reconcile(app)

# --- КОНФИГУРАЦИЯ БЕЗОПАСНОСТИ ---
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)

COMPARISON_CACHE: Dict[str, Any] = {}
CACHE_LOCK = Lock()
CACHE_TTL_MINUTES = int(os.getenv("CACHE_TTL_MINUTES", "60"))
CACHE_MAX_ITEMS = int(os.getenv("CACHE_MAX_ITEMS", "30"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

# --- МОДЕЛИ ---
class UserCreate(BaseModel):
    username: str
    password: str
    department: str
    is_admin: bool = False

class TaskCreate(BaseModel):
    title: str
    description: str
    to_department: str

class TaskStatusUpdate(BaseModel):
    status: str

class TaskUpdateContent(BaseModel):
    title: str
    description: str

class CommentCreate(BaseModel):
    content: str

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class DeptCreate(BaseModel):
    name: str


def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return username

async def require_admin(current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    is_admin = user[4] if len(user) > 4 else False
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def save_upload_file(upload_file: UploadFile) -> str:
    try:
        # ЗАЩИТА ОТ PATH TRAVERSAL: используем basename
        safe_filename = os.path.basename(upload_file.filename).replace(" ", "_")
        # Добавляем UUID для уникальности, чтобы файлы не перезаписывали друг друга
        unique_name = f"{uuid.uuid4().hex}_{safe_filename}"
        file_path = os.path.join(TEMP_DIR, unique_name)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        return file_path
    except Exception as e:
        log.error(f"Error saving file {upload_file.filename}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save file")


def cleanup_files(*file_paths):
    for path in file_paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                log.warning(f"Failed to remove temp file {path}: {e}")

def cleanup_cache():
    """Удаляет просроченные элементы и ограничивает размер кэша."""
    now = datetime.now()
    ttl = timedelta(minutes=CACHE_TTL_MINUTES)

    with CACHE_LOCK:
        # 1) удалить просроченные
        expired_keys = [
            k for k, v in COMPARISON_CACHE.items()
            if (now - v.get("created_at", now)) > ttl
        ]
        for k in expired_keys:
            COMPARISON_CACHE.pop(k, None)

        # 2) ограничить размер (удаляем самые старые)
        while len(COMPARISON_CACHE) > CACHE_MAX_ITEMS:
            oldest = min(COMPARISON_CACHE.keys(), key=lambda k: COMPARISON_CACHE[k]["created_at"])
            COMPARISON_CACHE.pop(oldest, None)

# --- API ---

@app.on_event("startup")
def startup_event():
    database_manager.init_database()
    log.info("Database initialized.")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "NeoExcelSync Backend is running"}

@app.post("/api/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = database_manager.get_user_by_username(form_data.username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not verify_password(form_data.password, user[2]):
        raise HTTPException(status_code=401, detail="Incorrect password")

    access_token = create_access_token(data={"sub": user[1]})
    return {"access_token": access_token, "token_type": "bearer"}

# --- СВЕРКА ---

@app.post("/api/compare")
async def run_comparison(
        file1: UploadFile = File(...),
        file2: UploadFile = File(...),
        settings_json: str = Form(...),
        id_col_1: str = Form(...),
        acc_col_1: str = Form(...),
        id_col_2: str = Form(...),
        acc_col_2: str = Form(...)
):
    f1_path = None
    f2_path = None
    try:

        original_name_1 = file1.filename
        original_name_2 = file2.filename
        f1_path = save_upload_file(file1)
        f2_path = save_upload_file(file2)
        settings = json.loads(settings_json)

        results = await run_in_threadpool(
            _process_comparison_sync,
            f1_path, id_col_1, acc_col_1,
            f2_path, id_col_2, acc_col_2,
            settings,
            original_name_1,
            original_name_2
        )

        # Сохраняем результат в кэш
        comparison_id = str(uuid.uuid4())

        with CACHE_LOCK:
            COMPARISON_CACHE[comparison_id] = {
                "data": results,
                "created_at": datetime.now()
            }

        cleanup_cache()

        # Подготовка ответа для JSON (DataFrame -> dict)
        json_response = {}
        for key, val in results.items():
            if isinstance(val, pd.DataFrame):
                json_response[key] = val.fillna("").to_dict(orient="records")
            elif isinstance(val, pd.Series):
                json_response[key] = val.to_dict()
            elif isinstance(val, list) or isinstance(val, set):
                json_response[key] = list(val)

        json_response['status'] = 'success'
        json_response['comparison_id'] = comparison_id

        return json_response

    except Exception as e:
        log.error(f"Comparison error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_files(f1_path, f2_path)


def _process_comparison_sync(f1_path, id_col_1, acc_col_1, f2_path, id_col_2, acc_col_2, settings, name1, name2):
    """Синхронная функция обработки, запускаемая в треде."""
    podft_settings = {
        'column': settings.get("podft_sum_col", "Сумма тг"),
        'threshold': settings.get("podft_threshold", "7000000"),
        'filter_enabled': settings.get("podft_filter_enabled", True),
        'filter_column': settings.get("podft_filter_col", "Рынок ЦБ"),
        'filter_values': settings.get("podft_filter_values", ""),
        'bo_enabled': settings.get("bo_enabled", True),
        'bo_unity_instrument_col': settings.get("bo_unity_instrument_col", "Instrument"),
        'bo_ais_sum_col': settings.get("bo_ais_sum_col", "Сумма тг"),
        'bo_threshold': settings.get("bo_threshold", "45000000"),
        'bo_prefixes': settings.get("bo_prefixes", "[BO],[OP]"),
    }
    overlap_accounts = settings.get("overlap_accounts", [])

    results, found_overlaps = processor.process_files(
        f1_path, id_col_1, acc_col_1,
        f2_path, id_col_2, acc_col_2,
        podft_settings,
        overlap_accounts,
        display_name1=name1,
        display_name2=name2
    )

    # Фильтр MISX
    if 'podft_7m_deals' in results and not results['podft_7m_deals'].empty:
        df_7m = results['podft_7m_deals']
        if 'Рынок ЦБ' in df_7m.columns:
            results['podft_7m_deals'] = df_7m[df_7m['Рынок ЦБ'] != 'MISX']

    # Логика Crypto
    if 'crypto_deals' in results and not results['crypto_deals'].empty:
        df_crypto = results['crypto_deals'].drop_duplicates()

        # Фильтры... (ваш код crypto логики)
        inst_cols = [c for c in df_crypto.columns if "инструмент" in c.lower() or "instrument" in c.lower()]
        if inst_cols:
            df_crypto = df_crypto[~df_crypto[inst_cols[0]].astype(str).str.startswith("FU")]

        sum_cols = [c for c in df_crypto.columns if "сумма" in c.lower() and "тг" in c.lower()]
        target_sum_col = "Сумма тг"

        def clean_sum(df, col):
            temp_series = df[col].astype(str).str.replace(r'\s+', '', regex=True).str.replace(',', '.')
            return pd.to_numeric(temp_series, errors='coerce')

        if target_sum_col in df_crypto.columns:
            df_crypto = df_crypto[clean_sum(df_crypto, target_sum_col) >= 5000000]
        elif sum_cols:
            df_crypto = df_crypto[clean_sum(df_crypto, sum_cols[0]) >= 5000000]

        crypto_keywords = settings.get("crypto_keywords", "")
        crypto_col = settings.get("crypto_col", "")
        if settings.get("crypto_enabled", False) and crypto_keywords and crypto_col:
            if crypto_col in df_crypto.columns:
                keywords = [k.strip().upper() for k in crypto_keywords.split(',') if k.strip()]
                pattern = '|'.join([re.escape(k) for k in keywords])
                df_crypto = df_crypto[
                    df_crypto[crypto_col].astype(str).str.upper().str.contains(pattern, regex=True, na=False)]

        results['crypto_deals'] = df_crypto

    results['found_overlaps'] = found_overlaps  # Добавляем в общий словарь для кэша
    return results


@app.get("/api/export/{comparison_id}")
async def export_excel_file(comparison_id: str):
    """Экспорт по ID без передачи данных обратно."""
    cleanup_cache()
    with CACHE_LOCK:
        cached = COMPARISON_CACHE.get(comparison_id)

    if not cached:
        raise HTTPException(status_code=404, detail="Результаты устарели или не найдены. Повторите сверку.")

    results = cached["data"]

    try:
        # генерация Excel в потоке, чтобы не блочить event loop
        stream = await run_in_threadpool(excel_exporter.export_results_to_stream, results)

        filename = f"Report_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

        return StreamingResponse(
            stream,
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    except Exception as e:
        log.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка генерации Excel")

@app.get("/api/last-result")
def get_last_result():
    if not COMPARISON_CACHE:
        return {"status": "empty", "message": "No data"}

    last_key = list(COMPARISON_CACHE.keys())[-1]
    results = COMPARISON_CACHE[last_key]["data"]

    json_response = {}
    for key, val in results.items():
        if isinstance(val, pd.DataFrame):
            json_response[key] = val.fillna("").to_dict(orient="records")
        elif isinstance(val, pd.Series):
            json_response[key] = val.to_dict()
        elif isinstance(val, set):
            json_response[key] = list(val)

    json_response['status'] = 'success'
    return json_response

@app.get("/api/settings")
def get_settings():
    return settings_manager.load_settings()

@app.post("/api/settings")
def update_settings(new_settings: dict):
    return settings_manager.save_settings(new_settings)

@app.post("/api/settings/upload-split-list")
async def upload_split_list_reference(file: UploadFile = File(...)):
    try:
        upload_dir = "data"
        os.makedirs(upload_dir, exist_ok=True)

        safe_name = os.path.basename(file.filename)
        file_path = os.path.join(upload_dir, safe_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        current_settings = settings_manager.load_settings()
        current_settings['split_list_path'] = file_path
        settings_manager.save_settings(current_settings)
        return {"status": "success", "new_path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settings/split-list-content")
def get_split_list_content():
    try:
        settings = settings_manager.load_settings()
        path = settings.get("split_list_path")
        if not path or not os.path.exists(path):
            return {"status": "empty", "data": [], "message": "Файл не найден"}

        df = pd.read_excel(path).fillna("")
        return {
            "status": "success",
            "data": df.to_dict(orient="records"),
            "filename": os.path.basename(path)
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/check-splits")
async def check_splits(daily_file: UploadFile = File(...), settings_json: str = Form(...)):
    daily_path = None
    try:
        daily_path = save_upload_file(daily_file)
        settings = json.loads(settings_json)

        success, result = await run_in_threadpool(split_processor.find_splits, daily_path, settings)

        if not success:
            return {"status": "error", "message": result}
        if result.empty:
            return {"status": "success", "data": [], "message": "No splits found"}

        return {
            "status": "success",
            "data": result.fillna("").to_dict(orient="records"),
            "message": f"Found {len(result)} splits"
        }
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cleanup_files(daily_path)

@app.get("/api/clients")
def search_clients(search: str = ""):
    raw = database_manager.search_clients(search)
    return [{"id": c[0], "name": c[1], "status": c[2]} for c in raw]


@app.get("/api/clients/{client_id}")
def get_client_details(client_id: int):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(404, "Client not found")

    folder = details.get("folder_path")
    files = []
    if folder and os.path.exists(folder):
        try:
            with os.scandir(folder) as entries:
                for entry in entries:
                    if entry.is_file():
                        files.append({"name": entry.name, "modified": entry.stat().st_mtime})
            files.sort(key=lambda x: x["name"])
        except Exception as e:
            log.error(f"Error listing files: {e}")
    details["files"] = files
    return details


@app.post("/api/clients")
def add_new_client(name: str = Form(...), email: str = Form(""), account: str = Form(""), folder_path: str = Form("")):
    success, msg = database_manager.add_client(name, email, account, folder_path_override=folder_path)
    if not success: raise HTTPException(400, msg)
    return {"status": "success", "message": msg}


@app.put("/api/clients/{client_id}/status")
def update_status(client_id: int, status_data: dict):
    database_manager.update_client_status(client_id, status_data.get("status"))
    return {"status": "success"}


@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int):
    success, msg = database_manager.delete_client(client_id)
    if not success: raise HTTPException(400, msg)
    return {"status": "success"}


@app.put("/api/clients/{client_id}")
def update_client_details(client_id: int, name: str = Form(...), email: str = Form(""), account: str = Form(""),
                          folder_path: str = Form("")):
    success, msg = database_manager.update_client(client_id, name, email, account, folder_path)
    if not success: raise HTTPException(400, msg)
    return {"status": "success"}


@app.post("/api/clients/{client_id}/upload")
def upload_file_to_client(client_id: int, file: UploadFile = File(...)):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(404, "Client not found")

    folder = details.get("folder_path")
    if not os.path.exists(folder): os.makedirs(folder, exist_ok=True)

    safe_name = os.path.basename(file.filename)  # Path traversal fix
    dest = os.path.join(folder, safe_name)
    try:
        with open(dest, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/clients/{client_id}/files/{filename}")
def download_client_file(client_id: int, filename: str):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(404, "Client not found")

    safe_name = os.path.basename(filename)  # Fix
    path = os.path.join(details.get("folder_path"), safe_name)

    if not os.path.exists(path): raise HTTPException(404, "File not found")
    return FileResponse(path, filename=safe_name)


@app.delete("/api/clients/{client_id}/files/{filename}")
def delete_client_file(client_id: int, filename: str):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(404, "Client not found")

    safe_name = os.path.basename(filename)
    path = os.path.join(details.get("folder_path"), safe_name)

    if os.path.exists(path):
        os.remove(path)
        return {"status": "success"}
    raise HTTPException(404, "File not found")


@app.post("/api/clients/reset-status")
async def reset_all_clients_status(current_user: str = Depends(get_current_user)):

    try:
        success = database_manager.reset_all_clients_statuses()  # Нужно добавить этот метод в database_manager!
        if success:
            return {"status": "success", "message": "Statuses reset"}
        raise HTTPException(500, "DB Error")
    except Exception as e:
        raise HTTPException(500, str(e))


# ЗАДАЧИ

@app.get("/api/tasks/{department}")
async def read_tasks(department: str, current_user: str = Depends(get_current_user)):
    tasks = database_manager.get_tasks_by_dept(department)
    return [dict(t) for t in tasks]


@app.post("/api/tasks")
async def create_new_task(task: TaskCreate, current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user: raise HTTPException(404, "User not found")

    task_id = database_manager.create_task(task.title, task.description, user[0], task.to_department)
    if task_id:
        return {"status": "success", "id": task_id}
    raise HTTPException(500, "Error creating task")


@app.put("/api/tasks/{task_id}/status")
async def change_task_status(task_id: int, status_data: TaskStatusUpdate,
                             current_user: str = Depends(get_current_user)):
    if database_manager.update_task_status(task_id, status_data.status):
        return {"status": "success"}
    raise HTTPException(500, "Error updating status")


@app.put("/api/tasks/{task_id}")
async def update_task_endpoint(task_id: int, task: TaskUpdateContent):
    success = database_manager.update_task(task_id, task.title, task.description)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to update task")

    return {"status": "success", "message": "Task updated"}

@app.get("/api/tasks/{task_id}/comments")
async def read_comments(task_id: int, current_user: str = Depends(get_current_user)):
    comments = database_manager.get_comments(task_id)
    return [dict(c) for c in comments]

@app.post("/api/tasks/{task_id}/comments")
async def create_new_comment(task_id: int, comment: CommentCreate, current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if database_manager.add_comment(task_id, user[0], comment.content):
        return {"status": "success"}
    raise HTTPException(500, "Error adding comment")


@app.post("/api/tasks/{task_id}/attachments")
async def upload_task_attachment(task_id: int, file: UploadFile = File(...),
                                 current_user: str = Depends(get_current_user)):
    base_dir = os.path.join(os.getcwd(), "task_files")
    os.makedirs(base_dir, exist_ok=True)

    safe_name = os.path.basename(file.filename)
    unique_name = f"{task_id}_{int(time.time())}_{safe_name}"
    file_path = os.path.join(base_dir, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if database_manager.add_task_attachment(task_id, safe_name, file_path):
        return {"status": "success", "filename": safe_name}
    raise HTTPException(500, "Error saving attachment")


@app.get("/api/tasks/{task_id}/attachments")
async def get_task_files(task_id: int, current_user: str = Depends(get_current_user)):
    return database_manager.get_task_attachments(task_id)


@app.get("/api/attachments/{attachment_id}")
async def download_attachment(attachment_id: int, current_user: str = Depends(get_current_user)):
    file_data = database_manager.get_attachment_by_id(attachment_id)
    if not file_data or not os.path.exists(file_data['file_path']):
        raise HTTPException(404, "File not found")
    return FileResponse(file_data['file_path'], filename=file_data['filename'])


@app.delete("/api/attachments/{attachment_id}")
async def remove_attachment(attachment_id: int, current_user: str = Depends(get_current_user)):
    file_data = database_manager.get_attachment_by_id(attachment_id)
    if file_data and os.path.exists(file_data['file_path']):
        os.remove(file_data['file_path'])

    if database_manager.delete_task_attachment(attachment_id):
        return {"status": "success"}
    raise HTTPException(500, "Error deleting attachment")


# ПОЛЬЗОВАТЕЛИ И ПРОФИЛЬ

@app.get("/api/profile")
async def get_profile_info(current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user: raise HTTPException(404, "User not found")

    is_admin = user[4] if len(user) > 4 else False
    stats = database_manager.get_user_stats(user[0])

    return {
        "id": user[0],
        "username": current_user,
        "department": user[3],
        "is_admin": is_admin,
        "stats": stats
    }

@app.post("/api/profile/change-password")
async def change_password(data: PasswordChange, current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user: raise HTTPException(404, "User not found")

    if not verify_password(data.old_password, user[2]):
        raise HTTPException(400, "Old password incorrect")

    salt = bcrypt.gensalt()
    new_hash = bcrypt.hashpw(data.new_password.encode('utf-8'), salt).decode('utf-8')

    if database_manager.update_user_password(user[0], new_hash):
        return {"status": "success"}
    raise HTTPException(500, "Error updating password")

@app.get("/api/dashboard")
async def get_dashboard_data(current_user: str = Depends(get_current_user)):
    return database_manager.get_dashboard_stats() or {"users": 0, "total_tasks": 0}

@app.get("/api/admin/users")
async def get_users_list(current_user: str = Depends(require_admin)):
    return database_manager.get_all_users()

@app.post("/api/admin/users")
async def admin_create_user(user: UserCreate, current_user: str = Depends(require_admin)):
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(user.password.encode('utf-8'), salt).decode('utf-8')
    if database_manager.create_new_user(user.username, hashed, user.department, user.is_admin):
        return {"status": "success"}
    raise HTTPException(400, "User exists or error")


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, current_user: str = Depends(get_current_user)):
    caller = database_manager.get_user_by_username(current_user)
    if caller and caller[0] == user_id:
        raise HTTPException(400, "Cannot delete yourself")
    if database_manager.delete_user(user_id):
        return {"status": "success"}
    raise HTTPException(500, "Error deleting user")


# --- ДЕПАРТАМЕНТЫ ---
@app.get("/api/departments")
def get_departments_list():
    return database_manager.get_all_departments()


@app.post("/api/admin/departments")
def create_department(dept: DeptCreate, current_user: str = Depends(require_admin)):
    success, msg = database_manager.add_department(dept.name)
    if not success: raise HTTPException(400, msg)
    return {"status": "success"}


@app.delete("/api/admin/departments/{dept_id}")
def remove_department(dept_id: int, current_user: str = Depends(require_admin)):
    if database_manager.delete_department(dept_id):
        return {"status": "success"}
    raise HTTPException(400, "Error deleting department")


@app.put("/api/admin/departments/{dept_id}")
def rename_department_endpoint(dept_id: int, dept: DeptCreate, current_user: str = Depends(require_admin)):
    if database_manager.rename_department(dept_id, dept.name):
        return {"status": "success"}
    raise HTTPException(400, "Error renaming")


# ИНСТРУМЕНТЫ

def clean_instrument_name(raw_name):
    s = str(raw_name).strip()
    if ']' in s: s = s.split(']')[1]
    if '.' in s: s = s.split('.')[0]
    if '::' in s: s = s.split('::')[0]
    return s.strip()


def read_dataset(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        return pd.read_csv(file_path, sep=None, engine='python', dtype=str)
    return pd.read_excel(file_path, dtype=str)

@app.post("/api/compare-instruments")
async def compare_instruments(
        file1: UploadFile = File(...),
        file2: UploadFile = File(...),
        col1: str = Form(...),
        col2: str = Form(...)
):
    f1_path = save_upload_file(file1)
    f2_path = save_upload_file(file2)
    try:

        res = await run_in_threadpool(_process_instruments, f1_path, f2_path, col1, col2)
        return res
    except Exception as e:
        raise HTTPException(400, str(e))
    finally:
        cleanup_files(f1_path, f2_path)


def _process_instruments(f1, f2, c1, c2):
    df1 = read_dataset(f1)
    df2 = read_dataset(f2)

    if c1 not in df1.columns: raise Exception(f"Column {c1} missing in file 1")
    if c2 not in df2.columns: raise Exception(f"Column {c2} missing in file 2")

    df1['clean'] = df1[c1].apply(clean_instrument_name)
    set1 = set(df1['clean'].dropna().unique())

    df2['clean'] = df2[c2].astype(str).str.strip()
    set2 = set(df2['clean'].dropna().unique())

    common = sorted(list(set1 & set2))
    missing_in_2 = sorted(list(set1 - set2))
    missing_in_1 = sorted(list(set2 - set1))

    return {
        "status": "success",
        "stats": {
            "total_file1": len(set1), "total_file2": len(set2),
            "matches": len(common), "only_in_1": len(missing_in_2), "only_in_2": len(missing_in_1)
        },
        "data": {
            "matches": common, "only_in_unity": missing_in_2, "only_in_ais": missing_in_1
        }
    }


@app.get("/api/my-tasks")
async def read_my_tasks(current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    tasks = database_manager.get_user_tasks(user[0])  # user[0] is ID
    return [dict(t) for t in tasks]

@app.delete("/api/tasks/{task_id}")
async def remove_task(task_id: int, current_user: str = Depends(get_current_user)):
    success = database_manager.delete_task(task_id)
    if success:
        return {"status": "success"}

    raise HTTPException(status_code=500, detail="Failed to delete task")

@app.get("/api/health")
def health_check():
    api_status = "Online"
    db_status = "Disconnected"
    try:
        conn = database_manager.get_db_connection()
        if conn:
            db_status = "Connected"
            conn.close()
    except Exception:
        pass
    return {"api": api_status, "db": db_status}


# ГЕНЕРАТОР ОТЧЕТОВ ПО СДЕЛКАМ

def format_report_number(num):
    """Форматирует число: пробел как разделитель тысяч, точка для дроби"""
    try:
        val = float(num)

        return "{:,.2f}".format(val).replace(",", " ")
    except:
        return str(num)


def parse_ticker_from_instrument(instr_str):
    """
    Превращает [EQ]AGQ.NYSEA.TOM -> AGQ
    Логика: берем текст между ']' и первой '.'
    """
    s = str(instr_str)
    try:

        if ']' in s:
            s = s.split(']')[1]

        if '.' in s:
            s = s.split('.')[0]
        return s.strip()
    except:
        return s


@app.post("/api/tools/generate-trade-report")
async def generate_trade_report(file: UploadFile = File(...)):
    temp_path = save_upload_file(file)
    try:

        df = pd.read_excel(temp_path)
        df.columns = [c.strip() for c in df.columns]

        required = ['Instrument', 'Amount', 'Quote amount']
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise HTTPException(400, f"В файле не найдены колонки: {missing}")

        report_lines = []

        df['Ticker'] = df['Instrument'].apply(parse_ticker_from_instrument)
        # Определяем тип: Лонг (Amount > 0) или Шорт (Amount < 0)
        df['Type'] = df['Amount'].apply(lambda x: 'лонг' if x > 0 else 'шорт')

        # Группируем по Тикеру и Типу.
        # sort=False сохраняет порядок появления (если нужно), но лучше отсортировать по тикеру
        grouped = df.groupby(['Ticker', 'Type'])

        for (ticker, trade_type), group in grouped:
            count_parts = len(group)

            amounts = group['Amount'].tolist()
            quotes = group['Quote amount'].tolist()

            amounts_str = " и ".join([str(x) for x in amounts])
            quotes_str = " и ".join([format_report_number(x) for x in quotes])


            total_amount = sum(amounts)
            total_quote = sum(quotes)

            line = (
                f"{ticker} ({trade_type}) раздробился на {count_parts} частей "
                f"по количеству — {amounts_str} "
                f"по сумме ({quotes_str}) "
                f"в общем количестве — {total_amount}, "
                f"а по сумме выходит {format_report_number(total_quote)}"
            )
            report_lines.append(line)

        full_text = "\n".join(report_lines)

        return {"status": "success", "report": full_text}

    except Exception as e:
        log.error(f"Report generation error: {e}", exc_info=True)
        raise HTTPException(500, f"Ошибка обработки файла: {str(e)}")
    finally:
        cleanup_files(temp_path)

