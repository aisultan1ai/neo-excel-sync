import shutil
import os
import json
import logging
import re
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.responses import FileResponse
import pandas as pd

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import bcrypt  # <--- ДОБАВИТЬ
from jose import JWTError, jwt
from datetime import datetime, timedelta

# Импорт вашей старой логики
import processor
import settings_manager
import split_processor
import excel_exporter
import database_manager

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)

app = FastAPI(title="NeoExcelSync API")

origins = [
    "http://localhost:5173",  # Адрес вашего React приложения
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Папка для временного хранения загруженных файлов
TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)

# --- ГЛОБАЛЬНАЯ ПЕРЕМЕННАЯ ДЛЯ ХРАНЕНИЯ ПОСЛЕДНЕГО РЕЗУЛЬТАТА ---
# (Внимание: при перезагрузке самого сервера Python данные пропадут, но при переходе по вкладкам сохранятся)
LAST_COMPARISON_RESULT = None


# --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

def save_upload_file(upload_file: UploadFile) -> str:
    """Сохраняет файл из браузера во временную папку и возвращает путь."""
    try:
        filename = upload_file.filename.replace(" ", "_")
        file_path = os.path.join(TEMP_DIR, filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        return file_path
    except Exception as e:
        log.error(f"Ошибка сохранения файла {upload_file.filename}: {e}")
        raise HTTPException(status_code=500, detail="Не удалось сохранить файл на сервере")


def cleanup_files(*file_paths):
    """Удаляет временные файлы."""
    for path in file_paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                log.warning(f"Не удалось удалить временный файл {path}: {e}")


# --- API ENDPOINTS (МАРШРУТЫ) ---

@app.on_event("startup")
def startup_event():
    """Запускается при старте сервера."""
    database_manager.init_database()
    log.info("База данных инициализирована.")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "NeoExcelSync Backend is running"}


# --- НОВЫЙ ЭНДПОИНТ: ПОЛУЧИТЬ ПОСЛЕДНИЙ РЕЗУЛЬТАТ ---
@app.get("/api/last-result")
def get_last_result():
    """Возвращает последний сохраненный результат сверки, если он есть."""
    global LAST_COMPARISON_RESULT
    if LAST_COMPARISON_RESULT is None:
        return {"status": "empty", "message": "Нет сохраненных данных"}
    return LAST_COMPARISON_RESULT


# 1. НАСТРОЙКИ
@app.get("/api/settings")
def get_settings():
    return settings_manager.load_settings()


@app.post("/api/settings")
def update_settings(new_settings: dict):
    return settings_manager.save_settings(new_settings)


# 2. СВЕРКА
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
    global LAST_COMPARISON_RESULT  # Объявляем, что будем писать в глобальную переменную

    f1_path = None
    f2_path = None
    try:
        # 1. Сохраняем файлы
        f1_path = save_upload_file(file1)
        f2_path = save_upload_file(file2)

        # 2. Парсим настройки
        settings = json.loads(settings_json)

        # Подготовка настроек для processor.py
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

        # 3. Запуск логики
        log.info(f"Начинаем сверку файлов: {f1_path} и {f2_path}")
        results, found_overlaps = processor.process_files(
            f1_path, id_col_1, acc_col_1,
            f2_path, id_col_2, acc_col_2,
            podft_settings,
            overlap_accounts
        )

        # --- ПОСТ-ОБРАБОТКА КРИПТЫ (ФИЛЬТРЫ) ---
        if 'crypto_deals' in results and not results['crypto_deals'].empty:
            df_crypto = results['crypto_deals']

            # 1. Удаляем полные дубликаты
            df_crypto = df_crypto.drop_duplicates()

            # 2. Фильтр "FU"
            inst_cols = [c for c in df_crypto.columns if "инструмент" in c.lower() or "instrument" in c.lower()]
            if inst_cols:
                col_name = inst_cols[0]
                df_crypto = df_crypto[~df_crypto[col_name].astype(str).str.startswith("FU")]

            # 3. ФИЛЬТР ПО СУММЕ >= 5 000 000
            sum_cols = [c for c in df_crypto.columns if "сумма" in c.lower() and "тг" in c.lower()]
            target_sum_col = "Сумма тг"

            if target_sum_col in df_crypto.columns:
                temp_series = df_crypto[target_sum_col].astype(str).str.replace(r'\s+', '', regex=True).str.replace(',',
                                                                                                                    '.')
                temp_numeric = pd.to_numeric(temp_series, errors='coerce')
                df_crypto = df_crypto[temp_numeric >= 5000000]

            elif sum_cols:
                col = sum_cols[0]
                temp_series = df_crypto[col].astype(str).str.replace(r'\s+', '', regex=True).str.replace(',', '.')
                temp_numeric = pd.to_numeric(temp_series, errors='coerce')
                df_crypto = df_crypto[temp_numeric >= 5000000]

            # 4. Фильтр по ключевым словам
            crypto_keywords = settings.get("crypto_keywords", "")
            crypto_col = settings.get("crypto_col", "")

            if settings.get("crypto_enabled", False) and crypto_keywords and crypto_col:
                if crypto_col in df_crypto.columns:
                    keywords = [k.strip().upper() for k in crypto_keywords.split(',') if k.strip()]
                    pattern = '|'.join([re.escape(k) for k in keywords])
                    df_crypto = df_crypto[
                        df_crypto[crypto_col].astype(str).str.upper().str.contains(pattern, regex=True, na=False)]

            results['crypto_deals'] = df_crypto
        # -------------------------------------------------------

        # 4. Формирование JSON ответа
        json_response = {}
        for key, val in results.items():
            if isinstance(val, pd.DataFrame):
                json_response[key] = val.fillna("").to_dict(orient="records")
            elif isinstance(val, pd.Series):
                json_response[key] = val.to_dict()

        json_response['found_overlaps'] = list(found_overlaps)
        # Добавляем статус, чтобы фронтенд знал, что это свежий результат
        json_response['status'] = 'success'

        # --- СОХРАНЯЕМ В ГЛОБАЛЬНУЮ ПЕРЕМЕННУЮ ---
        LAST_COMPARISON_RESULT = json_response
        log.info("Результат сверки сохранен в памяти сервера.")

        return json_response

    except Exception as e:
        log.error(f"Ошибка в процессе сверки: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_files(f1_path, f2_path)


# 3. ЭКСПОРТ
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
            stream,
            headers=headers,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        log.error(f"Ошибка экспорта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# 4. СПЛИТЫ
@app.post("/api/check-splits")
async def check_splits(
        daily_file: UploadFile = File(...),
        settings_json: str = Form(...)
):
    daily_path = None
    try:
        daily_path = save_upload_file(daily_file)
        settings = json.loads(settings_json)

        success, result = split_processor.find_splits(daily_path, settings)

        if not success:
            return {"status": "error", "message": result}

        if result.empty:
            return {"status": "success", "data": [], "message": "Сплиты не обнаружены"}

        return {
            "status": "success",
            "data": result.fillna("").to_dict(orient="records"),
            "message": f"Найдено {len(result)} сплитов"
        }

    except Exception as e:
        log.error(f"Ошибка проверки сплитов: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_files(daily_path)


@app.post("/api/settings/upload-split-list")
async def upload_split_list_reference(file: UploadFile = File(...)):
    """Загрузка ссылочного файла списка сплитов в настройки."""
    try:
        # Создаем папку data, если её нет
        upload_dir = "data"
        os.makedirs(upload_dir, exist_ok=True)

        # Формируем путь (сохраняем с оригинальным именем)
        # Можно принудительно назвать split_reference.xlsx, если хотите перезаписывать всегда
        file_path = os.path.join(upload_dir, file.filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Сразу обновляем настройки
        current_settings = settings_manager.load_settings()
        # Важно: сохраняем абсолютный путь или относительный, который поймет pandas
        # Лучше сохранять относительный путь, если скрипт запускается из корня
        current_settings['split_list_path'] = file_path
        settings_manager.save_settings(current_settings)

        return {"status": "success", "new_path": file_path}

    except Exception as e:
        log.error(f"Ошибка загрузки файла сплитов: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- КЛИЕНТЫ ---

@app.get("/api/clients")
def search_clients(search: str = ""):
    raw_clients = database_manager.search_clients(search)
    return [{"id": c[0], "name": c[1], "status": c[2]} for c in raw_clients]


@app.get("/api/clients/{client_id}")
def get_client_details(client_id: int):
    details = database_manager.get_client_details(client_id)
    if not details:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    folder_path = details.get("folder_path")
    files = []
    if folder_path and os.path.exists(folder_path):
        try:
            with os.scandir(folder_path) as entries:
                for entry in entries:
                    if entry.is_file():
                        mod_time = entry.stat().st_mtime
                        files.append({
                            "name": entry.name,
                            "modified": mod_time
                        })
            files.sort(key=lambda x: x["name"])
        except Exception as e:
            log.error(f"Ошибка чтения папки {folder_path}: {e}")

    details["files"] = files
    return details


@app.post("/api/clients")
def add_new_client(
        name: str = Form(...),
        email: str = Form(""),
        account: str = Form(""),
        folder_path: str = Form("")
):
    success, msg = database_manager.add_client(name, email, account, folder_path_override=folder_path)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}


@app.put("/api/clients/{client_id}/status")
def update_status(client_id: int, status_data: dict):
    new_status = status_data.get("status")
    database_manager.update_client_status(client_id, new_status)
    return {"status": "success"}


@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int):
    success, msg = database_manager.delete_client(client_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}


@app.get("/api/clients/{client_id}/files/{filename}")
def download_client_file(client_id: int, filename: str):
    details = database_manager.get_client_details(client_id)
    if not details:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    folder_path = details.get("folder_path")
    file_path = os.path.join(folder_path, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Файл не найден на сервере")

    return FileResponse(file_path, filename=filename)


@app.delete("/api/clients/{client_id}/files/{filename}")
def delete_client_file(client_id: int, filename: str):
    details = database_manager.get_client_details(client_id)
    if not details:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    folder_path = details.get("folder_path")
    file_path = os.path.join(folder_path, filename)

    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return {"status": "success"}
        else:
            raise HTTPException(status_code=404, detail="Файл уже удален")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clients/{client_id}/upload")
def upload_file_to_client(client_id: int, file: UploadFile = File(...)):
    details = database_manager.get_client_details(client_id)
    if not details:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    folder_path = details.get("folder_path")
    if not os.path.exists(folder_path):
        try:
            os.makedirs(folder_path, exist_ok=True)
        except:
            raise HTTPException(status_code=500, detail="Папка клиента не существует")

    dest_path = os.path.join(folder_path, file.filename)
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/clients/{client_id}")
def update_client_details(
        client_id: int,
        name: str = Form(...),
        email: str = Form(""),
        account: str = Form(""),
        folder_path: str = Form("")
):
    success, msg = database_manager.update_client(client_id, name, email, account, folder_path)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}


# НАСТРОЙКИ БЕЗОПАСНОСТИ
SECRET_KEY = "super-secret-key-change-this"  # Придумайте сложный ключ
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 часа

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
def verify_password(plain_password, hashed_password):
    # Преобразуем введенный пароль в байты
    plain_password_bytes = plain_password.encode('utf-8')
    # Преобразуем хеш из базы в байты (если он пришел строкой)
    hashed_password_bytes = hashed_password.encode('utf-8')

    # Проверяем через bcrypt напрямую
    return bcrypt.checkpw(plain_password_bytes, hashed_password_bytes)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# --- НОВЫЙ ENDPOINT ДЛЯ ВХОДА ---
@app.post("/api/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    print(f"Попытка входа: {form_data.username} / {form_data.password}")  # <--- ОТЛАДКА

    # Ищем пользователя
    user = database_manager.get_user_by_username(form_data.username)

    if not user:
        print("Пользователь не найден в БД")  # <--- ОТЛАДКА
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    # user[0]=id, user[1]=username, user[2]=hash
    # Проверяем пароль
    if not verify_password(form_data.password, user[2]):
        print("Пароль не совпал")  # <--- ОТЛАДКА
        raise HTTPException(status_code=401, detail="Неверный пароль")

    access_token = create_access_token(data={"sub": user[1]})
    return {"access_token": access_token, "token_type": "bearer"}


# ВАЖНО: Добавьте Depends в импорты fastapi:
from fastapi import FastAPI, Depends, HTTPException, status