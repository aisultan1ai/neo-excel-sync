"""Раздел «Крипто-транзакции»: разделы (редактируемые), история пополнений и выводов,
ручное добавление, импорт и выгрузка Excel."""
import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from core.deps import get_current_user
from db import crypto_tx as tx_db
from db import users as users_db
from services import crypto_tx_excel

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/crypto-tx")

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def require_access(current_user: str = Depends(get_current_user)) -> str:
    """Доступ у всех, кто вошёл в платформу (пользователь должен существовать)."""
    if not users_db.get_user_by_username(current_user):
        raise HTTPException(401, "Пользователь не найден")
    return current_user


def _strip(v):
    return (v or "").strip() or None


# ── Разделы ──────────────────────────────────────────────────────────────────

class SectionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    direction: str = "in"
    counterparty_label: str | None = Field(None, max_length=40)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = " ".join(v.split())
        if not v:
            raise ValueError("Укажите название раздела")
        return v

    @field_validator("direction")
    @classmethod
    def _dir(cls, v):
        if v not in ("in", "out"):
            raise ValueError("Направление: in (пополнение) или out (вывод)")
        return v

    @field_validator("counterparty_label")
    @classmethod
    def _label(cls, v):
        return _strip(v)


class SectionPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    direction: str | None = None
    counterparty_label: str | None = Field(None, max_length=40)
    sort_order: int | None = None
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            raise ValueError("Укажите название раздела")
        return v

    @field_validator("direction")
    @classmethod
    def _dir(cls, v):
        if v is not None and v not in ("in", "out"):
            raise ValueError("Направление: in (пополнение) или out (вывод)")
        return v


@router.get("/sections")
def sections(current_user: str = Depends(require_access)):
    return tx_db.list_sections()


@router.post("/sections", status_code=201)
def create_section(req: SectionIn, current_user: str = Depends(require_access)):
    try:
        return tx_db.create_section(req.model_dump(), current_user)
    except tx_db.SectionError as e:
        raise HTTPException(409, str(e))


@router.patch("/sections/{section_id}")
def update_section(section_id: int, req: SectionPatch, current_user: str = Depends(require_access)):
    data = req.model_dump(exclude_unset=True)
    if "counterparty_label" in data:
        data["counterparty_label"] = _strip(data["counterparty_label"])
    try:
        out = tx_db.update_section(section_id, data)
    except tx_db.SectionError as e:
        raise HTTPException(409, str(e))
    if not out:
        raise HTTPException(404, "Раздел не найден")
    log.info("crypto tx section %s updated by %s: %s", section_id, current_user, data)
    return out


@router.delete("/sections/{section_id}")
def delete_section(section_id: int, move_to: int | None = None, current_user: str = Depends(require_access)):
    try:
        moved = tx_db.delete_section(section_id, move_to)
    except tx_db.SectionError as e:
        raise HTTPException(409, str(e))
    log.info("crypto tx section %s deleted by %s, moved %s tx to %s", section_id, current_user, moved, move_to)
    return {"ok": True, "moved": moved}


# ── Транзакции ───────────────────────────────────────────────────────────────

class TxIn(BaseModel):
    section_id: int
    tx_time: datetime
    counterparty: str | None = Field(None, max_length=200)
    amount: float
    asset: str | None = Field(None, max_length=20)
    tx_hash: str | None = Field(None, max_length=200)
    comment: str | None = Field(None, max_length=1000)

    @field_validator("counterparty", "tx_hash", "comment")
    @classmethod
    def _s(cls, v):
        return _strip(v)

    @field_validator("asset")
    @classmethod
    def _asset(cls, v):
        return (v or "").strip().upper() or None

    @field_validator("amount")
    @classmethod
    def _amount(cls, v):
        if v <= 0:
            raise ValueError("Сумма должна быть больше нуля")
        return v

    def clean(self) -> dict:
        d = self.model_dump()
        d["tx_time"] = self.tx_time.replace(tzinfo=None, microsecond=0)
        return d


def _check_section(section_id: int):
    if not tx_db.get_section(section_id):
        raise HTTPException(400, "Раздел не найден")


def _period_label(date_from, date_to) -> str:
    f = date_from.strftime("%d.%m.%Y") if date_from else "начала"
    t = date_to.strftime("%d.%m.%Y") if date_to else "сегодня"
    return f"с {f} по {t}"


def _totals(items: list[dict]) -> dict:
    out: dict = {}
    for it in items:
        t = out.setdefault(it["section_id"], {"count": 0, "by_asset": {}})
        t["count"] += 1
        a = it.get("asset") or "—"
        t["by_asset"][a] = t["by_asset"].get(a, 0.0) + (it["amount"] or 0.0)
    return out


@router.get("")
def list_tx(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    section_id: int | None = None,
    q: str | None = Query(None, max_length=200),
    counterparty: str | None = Query(None, max_length=200),
    current_user: str = Depends(require_access),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "Дата «с» больше даты «по»")
    items = tx_db.list_tx(date_from, date_to, section_id, (q or "").strip() or None, counterparty or None)
    return {"items": items, "totals": _totals(items)}


@router.get("/counterparties")
def counterparties(current_user: str = Depends(require_access)):
    return tx_db.counterparties()


@router.post("", status_code=201)
def create_tx(req: TxIn, current_user: str = Depends(require_access)):
    row = req.clean()
    _check_section(row["section_id"])
    if tx_db.hash_exists(row["section_id"], row["tx_hash"]):
        raise HTTPException(409, "Транзакция с таким хэшем в этом разделе уже есть")
    return tx_db.create_tx(row, current_user)


@router.put("/{tx_id}")
def update_tx(tx_id: int, req: TxIn, current_user: str = Depends(require_access)):
    row = req.clean()
    _check_section(row["section_id"])
    if tx_db.hash_exists(row["section_id"], row["tx_hash"], exclude_id=tx_id):
        raise HTTPException(409, "Транзакция с таким хэшем в этом разделе уже есть")
    out = tx_db.update_tx(tx_id, row, current_user)
    if not out:
        raise HTTPException(404, "Транзакция не найдена")
    return out


@router.delete("/{tx_id}")
def delete_tx(tx_id: int, current_user: str = Depends(require_access)):
    if not tx_db.delete_tx(tx_id):
        raise HTTPException(404, "Транзакция не найдена")
    log.info("crypto tx %s deleted by %s", tx_id, current_user)
    return {"ok": True}


@router.post("/import")
async def import_excel(file: UploadFile = File(...), current_user: str = Depends(require_access)):
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Нужен файл Excel .xlsx")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "Файл больше 20 МБ")
    sections = tx_db.list_sections()
    try:
        rows, warnings = crypto_tx_excel.parse_workbook(content, sections)
    except ValueError as e:
        raise HTTPException(400, str(e))
    added, skipped = tx_db.import_rows(rows, current_user)
    by_section = {}
    for r in rows:
        by_section[r["section_id"]] = by_section.get(r["section_id"], 0) + 1
    log.info("crypto tx import by %s: file=%s rows=%s added=%s skipped=%s", current_user, file.filename,
             len(rows), added, skipped)
    return {"found": len(rows), "added": added, "duplicates": skipped, "by_section": by_section,
            "warnings": warnings[:100]}


@router.get("/export")
def export_excel(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    section_id: int | None = None,
    q: str | None = Query(None, max_length=200),
    counterparty: str | None = Query(None, max_length=200),
    current_user: str = Depends(require_access),
):
    items = tx_db.list_tx(date_from, date_to, section_id, (q or "").strip() or None, counterparty or None)
    sections = tx_db.list_sections()
    if section_id:
        sections = [s for s in sections if s["id"] == section_id]
    content = crypto_tx_excel.build_workbook(items, sections, _period_label(date_from, date_to))
    fname = f"crypto_transactions_{date_from or 'all'}_{date_to or 'now'}.xlsx"
    return Response(content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})
