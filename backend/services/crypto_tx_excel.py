"""Импорт/экспорт истории крипто-транзакций в Excel.

Формат — как в исходном файле «digital assets info»: на листе блоки с заголовком раздела,
под заголовком шапка «Дата | Откуда/Куда | Сумма | Хэш Транзакции» и строки. Блоки могут стоять
рядом и друг под другом. Блок относится к разделу:
  1) по точному названию раздела (так работают и разделы, добавленные вручную);
  2) иначе по словам «пополнения/вывод» + «биржи/кошельки» — к стандартным разделам.
Выгрузка делается в той же раскладке, поэтому скачанный файл можно загрузить обратно.
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime

import openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

_DATE_FORMATS = ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
                 "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%d/%m/%Y")


# ── Разбор значений ──────────────────────────────────────────────────────────

def parse_dt(v) -> datetime | None:
    if isinstance(v, datetime):
        return v.replace(microsecond=0, tzinfo=None)
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    if isinstance(v, str):
        s = v.strip()
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
    return None


def parse_amount(v) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace("\u00a0", "").replace(" ", "")
        s = s.replace(",", "") if ("," in s and "." in s) else s.replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _text(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def _norm(s: str) -> str:
    return _text(s).lower().replace("ё", "е")


def keyword_code(title: str) -> str | None:
    t = _norm(title)
    direction = "deposit" if "попол" in t else "withdraw" if "вывод" in t else None
    place = "exchange" if "бирж" in t else "wallet" if "кошел" in t else None
    return f"{direction}_{place}" if direction and place else None


def match_section(title: str, sections: list[dict]) -> dict | None:
    t = _norm(title)
    if not t:
        return None
    for s in sections:
        if _norm(s["name"]) == t:
            return s
    code = keyword_code(title)
    if code:
        for s in sections:
            if s.get("code") == code:
                return s
    return None


def _looks_like_title(text: str) -> bool:
    t = _norm(text)
    return bool(t) and t not in ("дата", "сумма") and not re.fullmatch(r"[\d.,\s:/-]+", t)


# ── Импорт ───────────────────────────────────────────────────────────────────

def parse_workbook(content: bytes, sections: list[dict]) -> tuple[list[dict], list[str]]:
    """Возвращает (строки, предупреждения). Строка: section_id, tx_time, counterparty, amount, tx_hash, asset, comment."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        raise ValueError(f"Не удалось открыть файл как Excel (.xlsx): {e}")

    rows, warnings = [], []
    found_blocks = 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if _norm(cell.value) != "дата":
                    continue
                r0, c0 = cell.row, cell.column
                # заголовок блока — в одной из двух строк выше, в этой или соседней колонке
                # (в исходном файле заголовок правых блоков стоит в H, а «Дата» — в G)
                section, title = None, ""
                for dr in (1, 2):
                    for dc in (0, 1, -1):
                        if r0 - dr >= 1 and c0 + dc >= 1:
                            t = _text(ws.cell(r0 - dr, c0 + dc).value)
                            if not t:
                                continue
                            title = title or (t if _looks_like_title(t) else "")
                            section = match_section(t, sections)
                            if section:
                                title = t
                                break
                    if section:
                        break
                if not section:
                    if title and "все транзакции" not in _norm(title):
                        warnings.append(f"Лист «{ws.title}», блок «{title}» (ячейка {cell.coordinate}): такого раздела нет — "
                                        f"блок пропущен. Создайте раздел с таким названием и загрузите файл ещё раз.")
                    continue

                cols = {"date": c0}
                for c in range(c0 + 1, c0 + 8):
                    h = _norm(ws.cell(r0, c).value)
                    if not h:
                        continue
                    if "сумм" in h and "amount" not in cols:
                        cols["amount"] = c
                    elif ("хэш" in h or "хеш" in h or "hash" in h) and "hash" not in cols:
                        cols["hash"] = c
                    elif ("откуда" in h or "куда" in h or "контрагент" in h) and "cp" not in cols:
                        cols["cp"] = c
                    elif ("актив" in h or "валют" in h or "asset" in h) and "asset" not in cols:
                        cols["asset"] = c
                    elif "коммент" in h and "comment" not in cols:
                        cols["comment"] = c
                if "amount" not in cols:
                    warnings.append(f"Лист «{ws.title}», блок «{title}»: нет колонки «Сумма» — блок пропущен")
                    continue
                found_blocks += 1

                r = r0 + 1
                while r <= ws.max_row:
                    vals = {k: ws.cell(r, c).value for k, c in cols.items()}
                    if all(_text(v) == "" for v in vals.values()):
                        break                       # пустая строка — конец блока
                    if _norm(vals["date"]) == "дата":
                        break                       # начался следующий блок
                    dt, amount = parse_dt(vals["date"]), parse_amount(vals["amount"])
                    where = f"Лист «{ws.title}», строка {r} ({section['name']})"
                    if dt is None:
                        warnings.append(f"{where}: не распознана дата «{_text(vals['date'])}» — строка пропущена")
                    elif amount is None or amount <= 0:
                        warnings.append(f"{where}: не распознана сумма «{_text(vals['amount'])}» — строка пропущена")
                    else:
                        rows.append({
                            "section_id": section["id"],
                            "tx_time": dt,
                            "counterparty": _text(vals.get("cp")) or None,
                            "amount": amount,
                            "tx_hash": _text(vals.get("hash")) or None,
                            "asset": _text(vals.get("asset")).upper() or None,
                            "comment": _text(vals.get("comment")) or None,
                        })
                    r += 1
    if not found_blocks:
        raise ValueError("В файле не найдено ни одного блока с известным разделом. Нужен заголовок раздела "
                         "(как в списке разделов или «Пополнения…/Вывод…» с «бирж»/«кошел»), а под ним шапка "
                         "«Дата | Откуда/Куда | Сумма | Хэш Транзакции».\n" + "\n".join(warnings[:5]))
    return rows, warnings


# ── Экспорт ──────────────────────────────────────────────────────────────────

_TITLE_FONT = Font(bold=True, size=12)
_HEAD_FONT = Font(bold=True)
_HEAD_FILL = PatternFill("solid", fgColor="D9E1F2")
_CENTER = Alignment(horizontal="center", vertical="center")
_DT_FMT = "DD.MM.YYYY HH:MM"
_NUM_FMT = "#,##0.########"


def who_label(section: dict) -> str:
    return section.get("counterparty_label") or ("Откуда" if section["direction"] == "in" else "Куда")


def _clean(v):
    return ILLEGAL_CHARACTERS_RE.sub("", v) if isinstance(v, str) else v


def _put(ws, r, c, v, **style):
    cell = ws.cell(row=r, column=c, value=_clean(v))
    if isinstance(v, str) and v.startswith("="):
        cell.data_type = "s"
    for k, s in style.items():
        setattr(cell, k, s)
    return cell


def _block(ws, top: int, left: int, section: dict, items: list[dict]):
    ws.merge_cells(start_row=top, start_column=left, end_row=top, end_column=left + 3)
    _put(ws, top, left, section["name"], font=_TITLE_FONT, alignment=_CENTER)
    for i, h in enumerate(["Дата", who_label(section), "Сумма", "Хэш Транзакции"]):
        _put(ws, top + 1, left + i, h, font=_HEAD_FONT, fill=_HEAD_FILL, alignment=_CENTER)
    for k, it in enumerate(items, start=top + 2):
        _put(ws, k, left, it["tx_time"], number_format=_DT_FMT)
        _put(ws, k, left + 1, it.get("counterparty"))
        _put(ws, k, left + 2, it["amount"], number_format=_NUM_FMT)
        _put(ws, k, left + 3, it.get("tx_hash"))


def build_workbook(items: list[dict], sections: list[dict], period_label: str) -> bytes:
    by_sec = {s["id"]: [] for s in sections}
    for it in items:
        by_sec.setdefault(it["section_id"], []).append(it)
    for v in by_sec.values():
        v.sort(key=lambda x: (x["tx_time"], x["id"]))
    sec_by_id = {s["id"]: s for s in sections}
    # блоки: активные разделы + архивные, если в выгрузке есть их транзакции; по два в ряд, как в исходном файле
    shown = [s for s in sections if not s.get("archived") or by_sec.get(s["id"])]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Транзакции"
    top = 2
    for i in range(0, len(shown), 2):
        pair = shown[i:i + 2]
        for s, left in zip(pair, (2, 7)):
            _block(ws, top, left, s, by_sec.get(s["id"], []))
        top += 2 + max(len(by_sec.get(s["id"], [])) for s in pair) + 4
    for col, width in {"A": 3, "B": 18, "C": 22, "D": 16, "E": 68, "F": 3, "G": 18, "H": 22, "I": 16, "J": 68}.items():
        ws.column_dimensions[col].width = width

    # сплошной список по датам — удобно фильтровать
    flat = wb.create_sheet("Все транзакции")
    _put(flat, 1, 1, f"Все транзакции · {period_label}", font=_TITLE_FONT)
    headers = ["Дата", "Раздел", "Направление", "Откуда / Куда", "Сумма", "Актив", "Хэш транзакции", "Комментарий",
               "Источник", "Добавил"]
    for i, h in enumerate(headers, 1):
        _put(flat, 2, i, h, font=_HEAD_FONT, fill=_HEAD_FILL, alignment=_CENTER)
    for r, it in enumerate(sorted(items, key=lambda x: (x["tx_time"], x["id"])), start=3):
        s = sec_by_id.get(it["section_id"], {})
        vals = [it["tx_time"], s.get("name"), "Пополнение" if s.get("direction") == "in" else "Вывод",
                it.get("counterparty"), it["amount"], it.get("asset"), it.get("tx_hash"), it.get("comment"),
                "Импорт" if it.get("source") == "import" else "Вручную", it.get("created_by")]
        for c, v in enumerate(vals, 1):
            fmt = {"number_format": _DT_FMT} if c == 1 else {"number_format": _NUM_FMT} if c == 5 else {}
            _put(flat, r, c, v, **fmt)
    flat.freeze_panes = "A3"
    if items:
        flat.auto_filter.ref = f"A2:{get_column_letter(len(headers))}{len(items) + 2}"
    for col, width in zip("ABCDEFGHIJ", (18, 32, 14, 24, 16, 10, 68, 30, 12, 14)):
        flat.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
