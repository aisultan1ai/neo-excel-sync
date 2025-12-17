import shutil
import time
import os
import json
import logging
import re
import bcrypt
import pandas as pd
import processor
import settings_manager
import split_processor
import excel_exporter
import database_manager

from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from jose import JWTError, jwt
from fastapi.responses import FileResponse

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)

app = FastAPI(title="NeoExcelSync API")


origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://192.168.0.198:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)
LAST_COMPARISON_RESULT = None

# --- SECURITY CONFIGURATION ---
SECRET_KEY = "super-secret-key-change-this"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

class UserCreate(BaseModel):
    username: str
    password: str
    department: str
    is_admin: bool = False

# --- PYDANTIC MODELS ---
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

# --- AUTHENTICATION FUNCTIONS ---

def verify_password(plain_password, hashed_password):
    """Checks password against hash."""
    plain_password_bytes = plain_password.encode('utf-8')
    hashed_password_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(plain_password_bytes, hashed_password_bytes)


def create_access_token(data: dict):
    """Generates JWT token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Decodes token and retrieves the current username."""
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


def save_upload_file(upload_file: UploadFile) -> str:
    try:
        filename = upload_file.filename.replace(" ", "_")
        file_path = os.path.join(TEMP_DIR, filename)
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


# --- API ENDPOINTS ---

@app.on_event("startup")
def startup_event():
    database_manager.init_database()
    log.info("Database initialized.")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "NeoExcelSync Backend is running"}


@app.get("/api/last-result")
def get_last_result():
    global LAST_COMPARISON_RESULT
    if LAST_COMPARISON_RESULT is None:
        return {"status": "empty", "message": "No data"}
    return LAST_COMPARISON_RESULT


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
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        current_settings = settings_manager.load_settings()
        current_settings['split_list_path'] = file_path
        settings_manager.save_settings(current_settings)
        return {"status": "success", "new_path": file_path}
    except Exception as e:
        log.error(f"Error uploading split list: {e}")
        raise HTTPException(status_code=500, detail=str(e))



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
    global LAST_COMPARISON_RESULT
    f1_path = None
    f2_path = None
    try:
        f1_path = save_upload_file(file1)
        f2_path = save_upload_file(file2)
        settings = json.loads(settings_json)

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

        log.info(f"Comparing files: {f1_path} and {f2_path}")
        results, found_overlaps = processor.process_files(
            f1_path, id_col_1, acc_col_1,
            f2_path, id_col_2, acc_col_2,
            podft_settings,
            overlap_accounts
        )

        # Logic for crypto filters...
        if 'crypto_deals' in results and not results['crypto_deals'].empty:
            df_crypto = results['crypto_deals']
            df_crypto = df_crypto.drop_duplicates()

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

        json_response = {}
        for key, val in results.items():
            if isinstance(val, pd.DataFrame):
                json_response[key] = val.fillna("").to_dict(orient="records")
            elif isinstance(val, pd.Series):
                json_response[key] = val.to_dict()

        json_response['found_overlaps'] = list(found_overlaps)
        json_response['status'] = 'success'
        LAST_COMPARISON_RESULT = json_response
        return json_response

    except Exception as e:
        log.error(f"Comparison error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_files(f1_path, f2_path)


@app.post("/api/export")
async def export_excel_file(report_data: dict):
    try:
        restored_results = {}
        keys = ['matches', 'unmatched1', 'unmatched2', 'podft_7m_deals',
                'podft_45m_bo_deals', 'crypto_deals', 'duplicates1', 'duplicates2']
        for key in keys:
            data = report_data.get(key, [])
            restored_results[key] = pd.DataFrame(data)
        if 'summary1' in report_data: restored_results['summary1'] = pd.Series(report_data['summary1'])
        if 'summary2' in report_data: restored_results['summary2'] = pd.Series(report_data['summary2'])

        stream = excel_exporter.export_results_to_stream(restored_results)
        filename = "Sverka_Report.xlsx"
        headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
        return StreamingResponse(
            stream, headers=headers,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        log.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/check-splits")
async def check_splits(daily_file: UploadFile = File(...), settings_json: str = Form(...)):
    daily_path = None
    try:
        daily_path = save_upload_file(daily_file)
        settings = json.loads(settings_json)
        success, result = split_processor.find_splits(daily_path, settings)

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
        log.error(f"Split check error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_files(daily_path)



@app.get("/api/clients")
def search_clients(search: str = ""):
    raw_clients = database_manager.search_clients(search)
    return [{"id": c[0], "name": c[1], "status": c[2]} for c in raw_clients]


@app.get("/api/clients/{client_id}")
def get_client_details(client_id: int):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(status_code=404, detail="Client not found")

    folder_path = details.get("folder_path")
    files = []
    if folder_path and os.path.exists(folder_path):
        try:
            with os.scandir(folder_path) as entries:
                for entry in entries:
                    if entry.is_file():
                        files.append({"name": entry.name, "modified": entry.stat().st_mtime})
            files.sort(key=lambda x: x["name"])
        except Exception as e:
            log.error(f"Error reading folder: {e}")
    details["files"] = files
    return details


@app.post("/api/clients")
def add_new_client(name: str = Form(...), email: str = Form(""), account: str = Form(""), folder_path: str = Form("")):
    success, msg = database_manager.add_client(name, email, account, folder_path_override=folder_path)
    if not success: raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}


@app.put("/api/clients/{client_id}/status")
def update_status(client_id: int, status_data: dict):
    database_manager.update_client_status(client_id, status_data.get("status"))
    return {"status": "success"}


@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int):
    success, msg = database_manager.delete_client(client_id)
    if not success: raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}


@app.put("/api/clients/{client_id}")
def update_client_details(client_id: int, name: str = Form(...), email: str = Form(""), account: str = Form(""),
                          folder_path: str = Form("")):
    success, msg = database_manager.update_client(client_id, name, email, account, folder_path)
    if not success: raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}


@app.get("/api/clients/{client_id}/files/{filename}")
def download_client_file(client_id: int, filename: str):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(status_code=404, detail="Client not found")
    file_path = os.path.join(details.get("folder_path"), filename)
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=filename)


@app.delete("/api/clients/{client_id}/files/{filename}")
def delete_client_file(client_id: int, filename: str):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(status_code=404, detail="Client not found")
    file_path = os.path.join(details.get("folder_path"), filename)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return {"status": "success"}
        else:
            raise HTTPException(status_code=404, detail="File already deleted")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clients/{client_id}/upload")
def upload_file_to_client(client_id: int, file: UploadFile = File(...)):
    details = database_manager.get_client_details(client_id)
    if not details: raise HTTPException(status_code=404, detail="Client not found")
    folder_path = details.get("folder_path")
    if not os.path.exists(folder_path): os.makedirs(folder_path, exist_ok=True)

    dest_path = os.path.join(folder_path, file.filename)
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- AUTH LOGIN ---
@app.post("/api/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    print(f"Login attempt: {form_data.username}")
    user = database_manager.get_user_by_username(form_data.username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not verify_password(form_data.password, user[2]):
        raise HTTPException(status_code=401, detail="Incorrect password")

    access_token = create_access_token(data={"sub": user[1]})
    return {"access_token": access_token, "token_type": "bearer"}


# --- TASKS (DEPARTMENTS) ---

@app.get("/api/tasks/{department}")
async def read_tasks(department: str, current_user: str = Depends(get_current_user)):
    tasks = database_manager.get_tasks_by_dept(department)
    return [dict(t) for t in tasks]

@app.post("/api/tasks")
async def create_new_task(task: TaskCreate, current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    task_id = database_manager.create_task(task.title, task.description, user[0], task.to_department)

    if task_id:
        # ВАЖНО: Мы должны вернуть ID, чтобы фронтенд мог загрузить файл
        return {"status": "success", "message": "Задача создана", "id": task_id}

    raise HTTPException(status_code=500, detail="Ошибка создания задачи")


@app.get("/api/tasks/{task_id}/comments")
async def read_comments(task_id: int, current_user: str = Depends(get_current_user)):
    comments = database_manager.get_comments(task_id)
    return [dict(c) for c in comments]


@app.post("/api/tasks/{task_id}/comments")
async def create_new_comment(task_id: int, comment: CommentCreate, current_user: str = Depends(get_current_user)):
    user_data = database_manager.get_user_by_username(current_user)
    success = database_manager.add_comment(task_id, user_data[0], comment.content)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to add comment")


@app.put("/api/tasks/{task_id}/status")
async def change_task_status(task_id: int, status_data: TaskStatusUpdate, current_user: str = Depends(get_current_user)):
    success = database_manager.update_task_status(task_id, status_data.status)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to update status")

@app.put("/api/tasks/{task_id}")
async def edit_task(task_id: int, data: TaskUpdateContent, current_user: str = Depends(get_current_user)):
    success = database_manager.update_task_content(task_id, data.title, data.description)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to update task")

@app.delete("/api/tasks/{task_id}")
async def remove_task(task_id: int, current_user: str = Depends(get_current_user)):
    success = database_manager.delete_task(task_id)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to delete task")


@app.get("/api/dashboard")
async def get_dashboard_data(current_user: str = Depends(get_current_user)):
    stats = database_manager.get_dashboard_stats()
    if not stats:
        # Если ошибка БД, вернем нули, чтобы фронт не упал
        return {
            "users": 0, "total_tasks": 0, "active_tasks": 0, "recent_tasks": []
        }
    return stats

@app.get("/api/profile")
async def get_profile_info(current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # user[0]=id, user[1]=username, user[2]=hash, user[3]=dept, user[4]=is_admin
    # Проверяем длину кортежа на случай старой БД
    is_admin = user[4] if len(user) > 4 else False

    stats = database_manager.get_user_stats(user[0])

    return {
        "id": user[0],
        "username": current_user,
        "department": user[3],
        "is_admin": is_admin,  # <--- ОТПРАВЛЯЕМ ФЛАГ АДМИНА
        "stats": stats
    }


@app.post("/api/profile/change-password")
async def change_password(data: PasswordChange, current_user: str = Depends(get_current_user)):
    user = database_manager.get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = user[0]
    current_hash = user[2]

    # 1. Проверяем старый пароль
    if not verify_password(data.old_password, current_hash):
        raise HTTPException(status_code=400, detail="Старый пароль введен неверно")

    # 2. Хешируем новый пароль
    new_password_bytes = data.new_password.encode('utf-8')
    salt = bcrypt.gensalt()
    new_hash = bcrypt.hashpw(new_password_bytes, salt).decode('utf-8')

    # 3. Сохраняем
    success = database_manager.update_user_password(user_id, new_hash)
    if success:
        return {"status": "success", "message": "Пароль успешно изменен"}

    raise HTTPException(status_code=500, detail="Ошибка при сохранении пароля")


@app.get("/api/admin/users")
async def get_users_list(current_user: str = Depends(get_current_user)):
    # Проверка прав (в реальном проекте тут нужна строгая проверка is_admin)
    return database_manager.get_all_users()


@app.post("/api/admin/users")
async def admin_create_user(user: UserCreate, current_user: str = Depends(get_current_user)):
    # Хешируем пароль
    password_bytes = user.password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt).decode('utf-8')

    success = database_manager.create_new_user(user.username, hashed, user.department, user.is_admin)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="User already exists or error")


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, current_user: str = Depends(get_current_user)):
    # Защита от удаления самого себя
    caller = database_manager.get_user_by_username(current_user)
    if caller and caller[0] == user_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")

    success = database_manager.delete_user(user_id)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to delete user")



@app.get("/api/departments")
def get_departments_list():
    # Доступно всем авторизованным (чтобы списки заполнять)
    return database_manager.get_all_departments()

@app.post("/api/admin/departments")
def create_department(dept: DeptCreate, current_user: str = Depends(get_current_user)):
    success, msg = database_manager.add_department(dept.name)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=400, detail=msg)

@app.delete("/api/admin/departments/{dept_id}")
def remove_department(dept_id: int, current_user: str = Depends(get_current_user)):
    success = database_manager.delete_department(dept_id)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="Ошибка удаления")

@app.put("/api/admin/departments/{dept_id}")
def rename_department_endpoint(dept_id: int, dept: DeptCreate, current_user: str = Depends(get_current_user)):
    success = database_manager.rename_department(dept_id, dept.name)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="Ошибка переименования")


@app.get("/api/settings/split-list-content")
def get_split_list_content():
    """Читает текущий файл сплитов и возвращает его содержимое."""
    try:

        settings = settings_manager.load_settings()
        path = settings.get("split_list_path")

        if not path or not os.path.exists(path):
            return {"status": "empty", "data": [], "message": "Файл сплитов не найден или путь не задан."}

        df = pd.read_excel(path)
        df = df.fillna("")

        return {
            "status": "success",
            "data": df.to_dict(orient="records"),
            "filename": os.path.basename(path)
        }
    except Exception as e:
        log.error(f"Ошибка чтения сплит-листа: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/{task_id}/attachments")
async def upload_task_attachment(task_id: int, file: UploadFile = File(...),
                                 current_user: str = Depends(get_current_user)):
    base_dir = os.path.join(os.getcwd(), "task_files")
    if not os.path.exists(base_dir):
        os.makedirs(base_dir)

    unique_name = f"{task_id}_{int(time.time())}_{file.filename}"
    file_path = os.path.join(base_dir, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    success = database_manager.add_task_attachment(task_id, file.filename, file_path)
    if success:
        return {"status": "success", "filename": file.filename}
    raise HTTPException(status_code=500, detail="Ошибка сохранения файла")


@app.get("/api/tasks/{task_id}/attachments")
async def get_task_files(task_id: int, current_user: str = Depends(get_current_user)):
    return database_manager.get_task_attachments(task_id)


@app.get("/api/attachments/{attachment_id}")
async def download_attachment(attachment_id: int, current_user: str = Depends(get_current_user)):
    file_data = database_manager.get_attachment_by_id(attachment_id)
    if not file_data or not os.path.exists(file_data['file_path']):
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(
        path=file_data['file_path'],
        filename=file_data['filename'],
        media_type='application/octet-stream'
    )


@app.delete("/api/attachments/{attachment_id}")
async def remove_attachment(attachment_id: int, current_user: str = Depends(get_current_user)):
    file_data = database_manager.get_attachment_by_id(attachment_id)
    if file_data and os.path.exists(file_data['file_path']):
        os.remove(file_data['file_path'])  # Удаляем с диска

    success = database_manager.delete_task_attachment(attachment_id)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Ошибка удаления")