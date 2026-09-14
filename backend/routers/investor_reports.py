import io
import logging
import os
import shutil
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from core.deps import get_current_user
from db import investor_reports as ir_db
from db.users import get_user_by_username
from services import fund_report as fr

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/investor-reports")

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_STORAGE_DIR = _BACKEND_DIR / "investor_reports_data"
_TEMPLATE_PATH = _BACKEND_DIR / "data" / "investor_report_template.docx"
_ALLOWED_EXTENSIONS = {".xls", ".xlsx", ".xlsm"}
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


# ─────────────────────────── Schemas ───────────────────────────

class FundData(BaseModel):
    assets: float
    expenses: float
    nav: float
    nav_per_unit_start: float
    nav_per_unit_end: float
    nav_per_unit_start_date: str
    nav_per_unit_end_date: str
    monthly_change_pct: float


class TrancheData(BaseModel):
    subscription_date: Optional[str] = None
    subscription_amount: float
    subscription_price: float
    units: float


class InvestorData(BaseModel):
    name: str
    tranches_count: Optional[int] = 0
    total_subscription: float
    total_units: float
    avg_subscription_price: float
    earliest_subscription_date: Optional[str] = None
    current_value: float
    monthly_income: float
    monthly_income_pct: float
    total_income: float
    total_income_pct: float
    tranches: list[TrancheData] = []


class ReportData(BaseModel):
    reporting_date: str
    unrecognized_sheets: list[str] = []
    fund: FundData
    investors: list[InvestorData]


class GenerateRequest(BaseModel):
    upload_token: str
    report: ReportData
    commentary: Optional[str] = None
    mode: str = "consolidated"
    formula: str = "B"
    source_filename: str
    fund_letter: Optional[str] = "G"                # A/B/C/G/H — подменит "Sub-Fund X" в docx
    reporting_date_override: Optional[str] = None   # напр. "30 September 2026" — перекроет reporting_date из Excel


# ─────────────────────────── Helpers ───────────────────────────

def _validate_extension(filename: str) -> str:
    ext = "." + (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Допустимые форматы: .xls, .xlsx")
    return ext


def _save_temp_upload(file: UploadFile) -> tuple[str, str]:
    """Возвращает (token, path). token = uuid без расширения — используется потом при generate."""
    ext = _validate_extension(file.filename)
    token = uuid.uuid4().hex
    safe_name = f"{token}{ext}"
    tmp_dir = _STORAGE_DIR / "_pending"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    path = tmp_dir / safe_name

    size = 0
    with open(path, "wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > _MAX_UPLOAD_BYTES:
                out.close()
                try:
                    path.unlink()
                except Exception:
                    pass
                raise HTTPException(400, "Файл слишком большой (максимум 20 МБ)")
            out.write(chunk)
    return token, str(path)


def _find_pending_path(token: str) -> Optional[Path]:
    tmp_dir = _STORAGE_DIR / "_pending"
    if not tmp_dir.exists():
        return None
    for p in tmp_dir.iterdir():
        if p.stem == token and p.suffix.lower() in _ALLOWED_EXTENSIONS:
            return p
    return None


def _parse_period_end(nav_end_date: str) -> Optional[str]:
    """DD.MM.YYYY → YYYY-MM-DD для колонки period_end."""
    try:
        return datetime.strptime(nav_end_date, "%d.%m.%Y").strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


# ─────────────────────────── Endpoints ───────────────────────────

@router.post("/preview")
async def preview(
    file: UploadFile = File(...),
    mode: str = Form("consolidated"),
    formula: str = Form("B"),
    current_user: str = Depends(get_current_user),
):
    """Загрузка Excel + парсинг → превью. Файл сохраняется во временном хранилище
    под токеном и переиспользуется на этапе /generate."""
    if mode not in ("consolidated", "single"):
        raise HTTPException(400, "mode должен быть 'consolidated' или 'single'")
    if formula not in ("A", "B"):
        raise HTTPException(400, "formula должна быть 'A' или 'B'")

    _validate_extension(file.filename)

    try:
        token, tmp_path = _save_temp_upload(file)
    except HTTPException:
        raise
    except Exception as e:
        log.error("preview save error: %s", e, exc_info=True)
        raise HTTPException(500, "Не удалось сохранить файл")

    try:
        if mode == "single":
            report = await run_in_threadpool(fr.parse_single_investor_report, tmp_path, formula)
        else:
            report = await run_in_threadpool(fr.parse_fund_report, tmp_path, None, formula)
    except ValueError as e:
        try:
            Path(tmp_path).unlink()
        except Exception:
            pass
        raise HTTPException(400, str(e))
    except Exception as e:
        log.error("preview parse error: %s", e, exc_info=True)
        try:
            Path(tmp_path).unlink()
        except Exception:
            pass
        raise HTTPException(400, "Не удалось прочитать Excel. Проверьте, что файл не повреждён.")

    result = fr.report_to_dict(report)
    result["upload_token"] = token
    result["source_filename"] = file.filename
    result["mode"] = mode
    result["formula"] = formula
    return result


@router.post("/generate")
async def generate(
    req: GenerateRequest,
    current_user: str = Depends(get_current_user),
):
    """Генерирует .docx для каждого инвестора, сохраняет их в постоянное хранилище + БД."""
    if not _TEMPLATE_PATH.exists():
        raise HTTPException(500, "Шаблон отчёта не найден на сервере")

    tmp_path = _find_pending_path(req.upload_token)
    if not tmp_path:
        raise HTTPException(400, "Файл превью не найден или истёк. Загрузите Excel заново.")

    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")

    report = fr.report_from_dict(req.report.model_dump())
    period_end = _parse_period_end(report.fund.nav_per_unit_end_date)

    upload = ir_db.create_upload(
        user_id=user.id,
        username=user.username,
        mode=req.mode,
        period_end=period_end,
        source_path="",  # обновим ниже после переноса файла
        source_filename=req.source_filename,
        commentary=req.commentary,
        meta={
            "formula": req.formula,
            "investors_count": len(report.investors),
            "reporting_date": report.reporting_date,
            "unrecognized_sheets": report.unrecognized_sheets,
        },
    )
    if not upload:
        raise HTTPException(500, "Не удалось создать запись загрузки")

    upload_id = upload["id"]
    dest_dir = _STORAGE_DIR / str(upload_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    source_dest = dest_dir / f"source{tmp_path.suffix}"
    try:
        shutil.move(str(tmp_path), str(source_dest))
    except Exception as e:
        log.error("move source error: %s", e, exc_info=True)
        ir_db.delete_upload(upload_id)
        raise HTTPException(500, "Не удалось сохранить исходный файл")

    # Обновляем source_path
    from core.database import get_db_connection
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE investor_report_uploads SET source_path=%s WHERE id=%s",
                    (str(source_dest), upload_id),
                )
            conn.commit()
        finally:
            conn.close()

    date_slug = report.reporting_date.replace(" ", "_")
    generated = []

    def _gen_all():
        results = []
        for investor in report.investors:
            filename = f"Investor_Report_{fr.sanitize_filename(investor.name)}_{date_slug}.docx"
            docx_path = dest_dir / filename
            fr.generate_docx(
                template_path=str(_TEMPLATE_PATH),
                report=report,
                investor=investor,
                output_path=str(docx_path),
                commentary=req.commentary,
                fund_letter=req.fund_letter,
                reporting_date_override=req.reporting_date_override,
            )
            results.append((investor, filename, docx_path))
        return results

    try:
        generated = await run_in_threadpool(_gen_all)
    except Exception as e:
        log.error("generate docx error: %s", e, exc_info=True)
        # чистим за собой
        shutil.rmtree(dest_dir, ignore_errors=True)
        ir_db.delete_upload(upload_id)
        raise HTTPException(500, f"Ошибка генерации отчётов: {e}")

    files_meta = []
    for investor, filename, docx_path in generated:
        file_row = ir_db.add_file(
            upload_id=upload_id,
            investor_name=investor.name,
            docx_path=str(docx_path),
            data={
                "filename": filename,
                "monthly_income": investor.monthly_income,
                "total_income": investor.total_income,
                "current_value": investor.current_value,
                "total_subscription": investor.total_subscription,
            },
        )
        if file_row:
            files_meta.append({
                "id": file_row["id"],
                "investor_name": investor.name,
                "filename": filename,
            })

    return {
        "upload_id": upload_id,
        "files": files_meta,
        "reporting_date": report.reporting_date,
        "investors_count": len(report.investors),
    }


@router.get("")
async def list_reports(current_user: str = Depends(get_current_user)):
    rows = ir_db.list_uploads()
    return rows


@router.get("/template")
async def download_template(mode: str = "consolidated",
                            current_user: str = Depends(get_current_user)):
    """Скачать пустой Excel-шаблон для заполнения бухгалтерией.
    mode: 'consolidated' (сводный на всех) | 'single' (один инвестор).
    Должен быть объявлен ДО `/{upload_id}` — иначе FastAPI попытается
    распарсить 'template' как int upload_id и вернёт 422."""
    if mode not in ("consolidated", "single"):
        raise HTTPException(400, "mode должен быть 'consolidated' или 'single'")

    try:
        content = await run_in_threadpool(fr.generate_template_xlsx, mode)
    except Exception as e:
        log.error("template gen error: %s", e, exc_info=True)
        raise HTTPException(500, "Не удалось сгенерировать шаблон")

    fname = ("investor_report_template_single.xlsx" if mode == "single"
             else "investor_report_template_consolidated.xlsx")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{upload_id}")
async def get_report_details(upload_id: int, current_user: str = Depends(get_current_user)):
    upload = ir_db.get_upload(upload_id)
    if not upload:
        raise HTTPException(404, "Загрузка не найдена")
    files = ir_db.list_files(upload_id)
    return {"upload": upload, "files": files}


@router.get("/{upload_id}/download/{file_id}")
async def download_file(upload_id: int, file_id: int,
                        current_user: str = Depends(get_current_user)):
    file_row = ir_db.get_file(file_id)
    if not file_row or file_row["upload_id"] != upload_id:
        raise HTTPException(404, "Файл не найден")
    docx_path = file_row["docx_path"]
    if not os.path.exists(docx_path):
        raise HTTPException(404, "Файл отсутствует на диске")
    filename = (file_row.get("data") or {}).get("filename") or os.path.basename(docx_path)
    return FileResponse(
        docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )


@router.get("/{upload_id}/download-zip")
async def download_zip(upload_id: int, current_user: str = Depends(get_current_user)):
    upload = ir_db.get_upload(upload_id)
    if not upload:
        raise HTTPException(404, "Загрузка не найдена")
    files = ir_db.list_files(upload_id)
    if not files:
        raise HTTPException(404, "Нет сгенерированных отчётов")

    def _build_zip() -> io.BytesIO:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                if os.path.exists(f["docx_path"]):
                    fname = (f.get("data") or {}).get("filename") or os.path.basename(f["docx_path"])
                    zf.write(f["docx_path"], arcname=fname)
        buf.seek(0)
        return buf

    buf = await run_in_threadpool(_build_zip)
    date_slug = (upload.get("period_end") or datetime.now().date().isoformat())
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="investor_reports_{date_slug}.zip"'},
    )


@router.get("/{upload_id}/source")
async def download_source(upload_id: int, current_user: str = Depends(get_current_user)):
    upload = ir_db.get_upload(upload_id)
    if not upload:
        raise HTTPException(404, "Загрузка не найдена")
    source_path = upload.get("source_path")
    if not source_path or not os.path.exists(source_path):
        raise HTTPException(404, "Исходный файл отсутствует")
    return FileResponse(
        source_path,
        media_type="application/octet-stream",
        filename=upload.get("source_filename") or os.path.basename(source_path),
    )


@router.delete("/{upload_id}")
async def delete_report(upload_id: int, current_user: str = Depends(get_current_user)):
    upload = ir_db.get_upload(upload_id)
    if not upload:
        raise HTTPException(404, "Загрузка не найдена")

    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")
    # Удалить может владелец или админ
    if not user.is_admin and upload.get("uploaded_by_user_id") != user.id:
        raise HTTPException(403, "Удаление разрешено только автору или администратору")

    ir_db.delete_upload(upload_id)
    # Удалить файлы с диска
    dest_dir = _STORAGE_DIR / str(upload_id)
    if dest_dir.exists():
        shutil.rmtree(dest_dir, ignore_errors=True)
    return {"ok": True}
