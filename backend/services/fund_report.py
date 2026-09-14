"""
Fund report service — парсит месячный Excel фонда и генерирует Word-отчёты
для каждого инвестора по утверждённому шаблону.

Портировано из fund_report_generator/fund_report_generator.py (reference implementation).
Формула Income for month использует Вариант B (как считает бухгалтерия в исходном Excel):
    value_start = Σ units_i × max(subscription_price_i, NAV_per_unit_start)
    income_month = current_value − value_start
"""

from __future__ import annotations

import io
import os
import re
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

import xlrd
from docx import Document
from docx.oxml.ns import qn
from lxml import etree
from openpyxl import load_workbook


# ============================================================
# МОДЕЛИ ДАННЫХ
# ============================================================

@dataclass
class FundMetrics:
    assets: float
    expenses: float
    nav: float
    nav_per_unit_start: float
    nav_per_unit_end: float
    nav_per_unit_start_date: str
    nav_per_unit_end_date: str
    monthly_change_pct: float


@dataclass
class InvestorTranche:
    subscription_date: Optional[str]
    subscription_amount: float
    subscription_price: float
    units: float


@dataclass
class InvestorPosition:
    name: str
    tranches: list[InvestorTranche] = field(default_factory=list)
    total_subscription: float = 0.0
    total_units: float = 0.0
    avg_subscription_price: float = 0.0
    earliest_subscription_date: Optional[str] = None
    current_value: float = 0.0
    monthly_income: float = 0.0
    monthly_income_pct: float = 0.0
    total_income: float = 0.0
    total_income_pct: float = 0.0

    def calculate(self, fund: FundMetrics, formula: str = "B"):
        self.total_subscription = sum(t.subscription_amount for t in self.tranches)
        self.total_units = sum(t.units for t in self.tranches)
        if self.total_units > 0:
            self.avg_subscription_price = self.total_subscription / self.total_units

        dates = [t.subscription_date for t in self.tranches if t.subscription_date]
        if dates:
            self.earliest_subscription_date = min(
                dates, key=lambda d: datetime.strptime(d, '%d.%m.%Y')
            )

        self.current_value = self.total_units * fund.nav_per_unit_end

        if formula == "A":
            try:
                start_boundary = datetime.strptime(fund.nav_per_unit_start_date, '%d.%m.%Y')
            except ValueError:
                start_boundary = None
            value_start = 0.0
            for t in self.tranches:
                is_new_this_month = False
                if t.subscription_date and start_boundary:
                    try:
                        sub_dt = datetime.strptime(t.subscription_date, '%d.%m.%Y')
                        is_new_this_month = sub_dt > start_boundary
                    except ValueError:
                        pass
                if is_new_this_month:
                    value_start += t.subscription_amount
                else:
                    value_start += t.units * fund.nav_per_unit_start
        else:
            # Вариант B — как в Excel: value_start = Σ units × max(subscription_price, NAV_start)
            value_start = sum(
                t.units * max(t.subscription_price, fund.nav_per_unit_start)
                for t in self.tranches
            )

        self.monthly_income = self.current_value - value_start
        if value_start > 0:
            self.monthly_income_pct = (self.current_value / value_start - 1) * 100

        self.total_income = self.current_value - self.total_subscription
        if self.total_subscription > 0:
            self.total_income_pct = (self.current_value / self.total_subscription - 1) * 100


@dataclass
class FundReport:
    fund: FundMetrics
    investors: list[InvestorPosition]
    reporting_date: str
    unrecognized_sheets: list[str] = field(default_factory=list)


# ============================================================
# УТИЛИТЫ
# ============================================================

INVESTOR_SHEET_PREFIX = 'в разбивке инвестор'


def _norm(s) -> str:
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s)).strip().lower()


def _excel_date(serial) -> Optional[str]:
    if serial is None or serial == '':
        return None
    try:
        d = datetime(1899, 12, 30) + timedelta(days=int(float(serial)))
        return d.strftime('%d.%m.%Y')
    except (ValueError, TypeError):
        return None


def _num(v) -> Optional[float]:
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


# ============================================================
# ПАРСИНГ EXCEL
# ============================================================

class ExcelParser:
    """Универсальный парсер: поддерживает .xls и .xlsx."""

    def __init__(self, path: str):
        self.path = path
        self.ext = os.path.splitext(path)[1].lower()
        self._sheets = self._load_all_sheets()

    def _load_all_sheets(self) -> dict[str, list[list]]:
        result = {}
        if self.ext == '.xls':
            wb = xlrd.open_workbook(self.path)
            for name in wb.sheet_names():
                sh = wb.sheet_by_name(name)
                rows = [[sh.cell_value(r, c) for c in range(sh.ncols)]
                        for r in range(sh.nrows)]
                result[name] = rows
        elif self.ext in ('.xlsx', '.xlsm'):
            wb = load_workbook(self.path, data_only=True)
            for name in wb.sheetnames:
                sh = wb[name]
                rows = [[cell.value for cell in row] for row in sh.iter_rows()]
                result[name] = rows
        else:
            raise ValueError(f'Не поддерживаемый формат: {self.ext}')
        return result

    def sheet_names(self) -> list[str]:
        return list(self._sheets.keys())

    def rows(self, name: str) -> list[list]:
        return self._sheets[name]

    def investor_sheets(self, extra_prefixes: list[str] = None) -> list[tuple[str, str]]:
        prefixes = [INVESTOR_SHEET_PREFIX]
        if extra_prefixes:
            prefixes += [p.lower() for p in extra_prefixes]

        result = []
        for name in self._sheets.keys():
            norm = _norm(name)
            for p in prefixes:
                if norm.startswith(p):
                    orig_idx = _norm(name).find(p) + len(p)
                    inv_name = name[orig_idx:].strip().rstrip('.').strip()
                    result.append((name, inv_name))
                    break
        return result


def parse_fund_metrics(rows: list[list]) -> FundMetrics:
    def value_after_label(row: list, label_col_idx: int):
        for j in range(label_col_idx + 1, len(row)):
            v = _num(row[j])
            if v is not None:
                return v
        return None

    def find_label(labels: list[str]) -> Optional[float]:
        wanted = [_norm(l) for l in labels]
        for row in rows:
            for j, cell in enumerate(row):
                label = _norm(cell)
                if not label:
                    continue
                if label in wanted or any(label.startswith(w) for w in wanted):
                    val = value_after_label(row, j)
                    if val is not None:
                        return val
        return None

    def find_nav_per_unit_rows() -> list[tuple[str, float]]:
        result = []
        pattern = re.compile(r'^nav per unit\s*(.*)$', re.IGNORECASE)
        for row in rows:
            for j, cell in enumerate(row):
                if cell is None:
                    continue
                m = pattern.match(str(cell).strip())
                if m:
                    date_str = m.group(1).strip()
                    val = value_after_label(row, j)
                    if val is not None:
                        result.append((date_str, val))
        return result

    nav_rows = find_nav_per_unit_rows()
    if len(nav_rows) < 2:
        raise ValueError(f"Не найдены две строки 'NAV per unit' (найдено {len(nav_rows)}).")

    def date_key(item):
        try:
            return datetime.strptime(item[0], '%d.%m.%Y')
        except ValueError:
            return datetime.min

    nav_rows_sorted = sorted(nav_rows, key=date_key)
    start_val = nav_rows_sorted[0][1]

    return FundMetrics(
        assets=find_label(['Assets']) or 0,
        expenses=find_label(['Expenses']) or 0,
        nav=find_label(['NAV']) or 0,
        nav_per_unit_start=start_val,
        nav_per_unit_end=nav_rows_sorted[-1][1],
        nav_per_unit_start_date=nav_rows_sorted[0][0],
        nav_per_unit_end_date=nav_rows_sorted[-1][0],
        monthly_change_pct=(nav_rows_sorted[-1][1] / start_val - 1) * 100 if start_val else 0,
    )


def parse_investor_tranches(rows: list[list], subscription_dates: list[dict]) -> tuple[list[InvestorTranche], Optional[str]]:
    """Возвращает (список траншей, реальное имя инвестора из таблицы)."""

    header_idx = None
    header_row = None
    for i, row in enumerate(rows):
        for cell in row:
            if _norm(cell).startswith('инве'):
                header_idx = i
                header_row = row
                break
        if header_idx is not None:
            break
    if header_idx is None:
        raise ValueError("Не найден заголовок таблицы позиции инвестора.")

    col_name = col_amount = col_price = col_units = None
    for j, cell in enumerate(header_row):
        c = _norm(cell)
        if not c:
            continue
        if c.startswith('инве') and col_name is None:
            col_name = j
        elif ('первоначальная сумма' in c or c.startswith('сумма')) and col_amount is None:
            col_amount = j
        elif ('стоимость 1 акции' in c and ('подпис' in c or 'номинал' in c)) and col_price is None:
            col_price = j
        elif 'количество' in c and col_units is None:
            col_units = j

    if None in (col_name, col_amount, col_price, col_units):
        raise ValueError(
            f"Не удалось определить колонки таблицы. "
            f"name={col_name}, amount={col_amount}, price={col_price}, units={col_units}"
        )

    tranches = []
    real_name = None
    for row in rows[header_idx + 1:]:
        if len(row) <= max(col_amount, col_price, col_units):
            continue
        amount = _num(row[col_amount])
        price = _num(row[col_price])
        units = _num(row[col_units])
        if amount is None or price is None or units is None:
            continue

        if real_name is None and col_name is not None and col_name < len(row):
            name_cell = row[col_name]
            if name_cell and _num(name_cell) is None:
                real_name = str(name_cell).strip()

        date = find_subscription_date(subscription_dates, amount, price, units)

        tranches.append(InvestorTranche(
            subscription_date=date,
            subscription_amount=amount,
            subscription_price=price,
            units=units,
        ))

    return tranches, real_name


def build_subscription_dates_map(parser: ExcelParser) -> list[dict]:
    """Собирает список траншей из сводных листов с датами подписки."""
    result = []
    candidate_sheets_norm = [_norm(s) for s in [
        'за текущий год', 'Performance fee 15%_', 'за июль', 'за август',
        'за январь', 'за февраль', 'за март', 'за апрель', 'за май', 'за июнь',
        'за сентябрь', 'за октябрь', 'за ноябрь', 'за декабрь',
    ]]

    for sheet_name in parser.sheet_names():
        if _norm(sheet_name) not in candidate_sheets_norm:
            continue
        rows = parser.rows(sheet_name)
        for i, row in enumerate(rows):
            date_col = amount_col = price_col = units_col = None
            for j, cell in enumerate(row):
                c = _norm(cell)
                if c == 'дата ввода':
                    date_col = j
                elif c.startswith('сумма взноса') or c.startswith('первоначальная сумма'):
                    amount_col = j
                elif 'стоимость 1 акции' in c and ('подпис' in c or 'номинал' in c):
                    price_col = j
                elif 'количество' in c and units_col is None:
                    units_col = j
            if date_col is None or amount_col is None or price_col is None:
                continue
            batch = []
            for data_row in rows[i + 1:]:
                if len(data_row) <= max(date_col, amount_col, price_col):
                    break
                if any(_norm(c).startswith('инве') for c in data_row):
                    break
                amount = _num(data_row[amount_col])
                price = _num(data_row[price_col])
                units = _num(data_row[units_col]) if units_col is not None else None
                date = _excel_date(data_row[date_col])
                if amount is None and price is None:
                    break
                if amount is not None and price is not None and date is not None:
                    batch.append({'amount': amount, 'price': price,
                                  'units': units, 'date': date})
            if batch:
                result = batch
            break
    return result


def find_subscription_date(tranches_index: list[dict], amount: float, price: float,
                           units: float = None) -> Optional[str]:
    for t in tranches_index:
        if abs(t['amount'] - amount) < 0.01 and abs(t['price'] - price) < 0.001:
            return t['date']
    matches = [t for t in tranches_index if abs(t['amount'] - amount) < 0.01]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]['date']

    def dist(t):
        d = abs(t['price'] - price)
        if units is not None and t['units'] is not None:
            d += abs(t['units'] - units) * 0.001
        return d

    best = min(matches, key=dist)
    if abs(best['price'] - price) < 0.5:
        return best['date']
    return None


def parse_fund_report(xlsx_path: str, extra_prefixes: list[str] = None,
                      formula: str = "B") -> FundReport:
    """Парсит сводный Excel фонда → FundReport."""
    parser = ExcelParser(xlsx_path)
    sub_dates_map = build_subscription_dates_map(parser)

    investor_sheets = parser.investor_sheets(extra_prefixes=extra_prefixes)
    if not investor_sheets:
        raise ValueError(
            "В файле не найдено ни одного листа с инвестором. "
            "Ожидались листы, начинающиеся с 'В разбивке инвестор'."
        )

    matched_sheet_names = {name for name, _ in investor_sheets}
    unrecognized = [n for n in parser.sheet_names() if n not in matched_sheet_names]

    fund = None
    investors = []
    for sheet_name, inv_name_from_sheet in investor_sheets:
        rows = parser.rows(sheet_name)

        if fund is None:
            fund = parse_fund_metrics(rows)

        tranches, real_name = parse_investor_tranches(rows, sub_dates_map)
        pos = InvestorPosition(name=real_name or inv_name_from_sheet, tranches=tranches)
        pos.calculate(fund, formula=formula)
        investors.append(pos)

    try:
        d = datetime.strptime(fund.nav_per_unit_end_date, '%d.%m.%Y')
        reporting_date = d.strftime('%d %B %Y')
    except ValueError:
        reporting_date = fund.nav_per_unit_end_date

    return FundReport(
        fund=fund,
        investors=investors,
        reporting_date=reporting_date,
        unrecognized_sheets=unrecognized,
    )


def parse_single_investor_report(xlsx_path: str, formula: str = "B") -> FundReport:
    """Альтернативный режим: один Excel = один инвестор.
    Fund metrics + investor tranches — на первом листе с данными.
    Дата подписки — если найдётся в этом же файле в отдельной таблице, иначе None."""
    parser = ExcelParser(xlsx_path)
    sub_dates_map = build_subscription_dates_map(parser)

    fund = None
    used_sheet = None
    for name in parser.sheet_names():
        rows = parser.rows(name)
        try:
            fund = parse_fund_metrics(rows)
            used_sheet = name
            break
        except ValueError:
            continue

    if fund is None:
        raise ValueError(
            "Не найден лист с показателями фонда (NAV per unit). "
            "Проверьте, что файл содержит стандартную структуру индивидуального отчёта."
        )

    rows = parser.rows(used_sheet)
    tranches, real_name = parse_investor_tranches(rows, sub_dates_map)
    if not tranches:
        raise ValueError(f"На листе «{used_sheet}» не найдены данные позиции инвестора.")

    pos = InvestorPosition(name=real_name or used_sheet.strip(), tranches=tranches)
    pos.calculate(fund, formula=formula)

    try:
        d = datetime.strptime(fund.nav_per_unit_end_date, '%d.%m.%Y')
        reporting_date = d.strftime('%d %B %Y')
    except ValueError:
        reporting_date = fund.nav_per_unit_end_date

    return FundReport(
        fund=fund,
        investors=[pos],
        reporting_date=reporting_date,
        unrecognized_sheets=[],
    )


# ============================================================
# ГЕНЕРАЦИЯ WORD-ОТЧЁТА
# ============================================================

GREEN_HEX = '1E7B34'
RED_HEX = 'B22222'


def _fmt_usd_en(x: float, decimals: int = 2) -> str:
    return f'USD {x:,.{decimals}f}'


def _fmt_usd_ru(x: float, decimals: int = 2) -> str:
    return f'USD {x:,.{decimals}f}'.replace(',', ' ').replace('.', ',')


def _fmt_pct_ru(x: float, decimals: int = 2, sign: bool = True) -> str:
    sign_char = ('+' if x >= 0 else '') if sign else ''
    return f'{sign_char}{x:.{decimals}f}%'.replace('.', ',')


def _set_cell_text(cell, new_text: str):
    for i, p in enumerate(cell.paragraphs):
        if i == 0:
            runs = p.runs
            if runs:
                runs[0].text = new_text
                for r in runs[1:]:
                    r.text = ''
            else:
                p.add_run(new_text)
        else:
            p._element.getparent().remove(p._element)


def _recolor_cell_runs(cell, color_hex: str, bold: bool = False):
    """Меняет цвет (и жирность) всех run-ов в первой строке ячейки."""
    for p in cell.paragraphs:
        for run in p.runs:
            r_element = run._r
            rPr = r_element.find(qn('w:rPr'))
            if rPr is None:
                rPr = etree.SubElement(r_element, qn('w:rPr'))
                r_element.insert(0, rPr)
            for old in rPr.findall(qn('w:color')):
                rPr.remove(old)
            color_el = etree.SubElement(rPr, qn('w:color'))
            color_el.set(qn('w:val'), color_hex)
            if bold:
                for old in rPr.findall(qn('w:b')):
                    rPr.remove(old)
                etree.SubElement(rPr, qn('w:b'))


def _clone_row_replacing_text(template_row, texts: list[str],
                              colored_value_index: Optional[int] = None,
                              color_hex: str = GREEN_HEX,
                              bold: bool = False):
    new_tr = deepcopy(template_row._tr)
    orig_tcs = template_row._tr.findall(qn('w:tc'))
    new_tcs = new_tr.findall(qn('w:tc'))

    for i, (tc, text) in enumerate(zip(new_tcs, texts)):
        paragraphs = tc.findall(qn('w:p'))
        for p in paragraphs[1:]:
            tc.remove(p)
        p = paragraphs[0]
        for run in p.findall(qn('w:r')):
            p.remove(run)

        orig_p = orig_tcs[i].find(qn('w:p'))
        orig_run = orig_p.find(qn('w:r')) if orig_p is not None else None
        if orig_run is not None:
            new_run = deepcopy(orig_run)
            for t in new_run.findall(qn('w:t')):
                new_run.remove(t)
            new_t = etree.SubElement(new_run, qn('w:t'))
            new_t.text = text
            new_t.set(qn('xml:space'), 'preserve')

            if colored_value_index is not None and i == colored_value_index:
                rPr = new_run.find(qn('w:rPr'))
                if rPr is None:
                    rPr = etree.Element(qn('w:rPr'))
                    new_run.insert(0, rPr)
                for old in rPr.findall(qn('w:color')):
                    rPr.remove(old)
                color_el = etree.SubElement(rPr, qn('w:color'))
                color_el.set(qn('w:val'), color_hex)
                if bold:
                    for old in rPr.findall(qn('w:b')):
                        rPr.remove(old)
                    etree.SubElement(rPr, qn('w:b'))

            p.append(new_run)
        else:
            new_run = etree.SubElement(p, qn('w:r'))
            new_t = etree.SubElement(new_run, qn('w:t'))
            new_t.text = text
    return new_tr


def _ensure_income_rows(inv_table, report: FundReport, investor: InvestorPosition):
    fund = report.fund
    try:
        d = datetime.strptime(fund.nav_per_unit_end_date, '%d.%m.%Y')
        month_label = d.strftime('%B %Y')
    except ValueError:
        month_label = fund.nav_per_unit_end_date

    def format_income(value: float, pct: float) -> str:
        """USD +1 182,30 или USD −378 473,95 — знак ПОСЛЕ 'USD ', перед числом."""
        sign = '+' if value > 0 else ('−' if value < 0 else '')
        formatted = _fmt_usd_ru(abs(value))  # "USD 1 182,30"
        with_sign = formatted.replace('USD ', f'USD {sign}', 1) if sign else formatted
        return f'{with_sign}  ({_fmt_pct_ru(pct)})'

    monthly_str = format_income(investor.monthly_income, investor.monthly_income_pct)
    total_str = format_income(investor.total_income, investor.total_income_pct)

    # Стабильный префикс для поиска существующей строки в шаблоне независимо от месяца
    labels_and_values = [
        ('Income for ', f'Income for {month_label}', monthly_str, investor.monthly_income),
        ('Total Income since Subscription',
         f'Total Income since Subscription ({investor.earliest_subscription_date or "—"})',
         total_str, investor.total_income),
    ]

    tbl_element = inv_table._tbl
    tpl_row = inv_table.rows[-1]

    for search_prefix, label, value, amount in labels_and_values:
        existing = None
        for row in inv_table.rows:
            if row.cells[0].text.strip().startswith(search_prefix):
                existing = row
                break
        color = GREEN_HEX if amount >= 0 else RED_HEX
        if existing is not None:
            _set_cell_text(existing.cells[0], label)
            _set_cell_text(existing.cells[1], value)
            # Перекрашиваем колонку value в актуальный цвет (green/red)
            _recolor_cell_runs(existing.cells[1], color, bold=True)
        else:
            new_row = _clone_row_replacing_text(
                tpl_row, [label, value],
                colored_value_index=1, color_hex=color, bold=True,
            )
            tbl_element.append(new_row)


def _replace_commentary(doc: Document, commentary: Optional[str],
                        growth_pct: Optional[float] = None):
    """Обновляет блок Manager's Commentary.

    Если commentary содержит '\\n\\n' — split по двойному переносу, первая часть
    идёт в первый параграф, вторая — во второй. Если только один параграф в user-тексте,
    второй параграф шаблона обновляется только по growth_pct (подмена %-числа).
    """
    paragraphs = doc.paragraphs
    heading_idx = None
    for i, p in enumerate(paragraphs):
        if 'commentary' in p.text.lower() and not p.text.strip().lower().startswith('disclaimer'):
            heading_idx = i
            break
    if heading_idx is None:
        return

    body_indices = []
    for j in range(heading_idx + 1, len(paragraphs)):
        p = paragraphs[j]
        low = p.text.lower()
        if 'disclaimer' in low:
            break
        if p.text.strip():
            body_indices.append(j)

    user_parts = []
    if commentary:
        user_parts = [chunk.strip() for chunk in re.split(r'\n\s*\n', commentary) if chunk.strip()]

    def _set_paragraph_text(p, text: str):
        if p.runs:
            p.runs[0].text = text
            for r in p.runs[1:]:
                r.text = ''
        else:
            p.add_run(text)

    if user_parts and body_indices:
        _set_paragraph_text(paragraphs[body_indices[0]], user_parts[0])

    if len(user_parts) > 1 and len(body_indices) > 1:
        _set_paragraph_text(paragraphs[body_indices[1]], user_parts[1])
    elif growth_pct is not None:
        pct_text = f'{growth_pct:.2f}'.replace('.', ',')
        target_indices = body_indices[1:] if user_parts else body_indices
        for j in target_indices:
            p = paragraphs[j]
            new_text = re.sub(r'\d+([.,]\d+)?\s*%', f'{pct_text}%', p.text, count=1)
            if new_text != p.text and p.runs:
                p.runs[0].text = new_text
                for r in p.runs[1:]:
                    r.text = ''


def _collapse_empty_between_commentary(doc: Document):
    """Убирает пустой параграф-разделитель между двумя параграфами commentary.
    В шаблоне между 'During {month}...' и 'During the reporting period...' есть пустой <w:p>
    который добавляет вертикальный пробел ~ 1 строку — и может выкинуть Disclaimer на 2-ю страницу."""
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    paragraphs = doc.paragraphs

    heading_idx = None
    for i, p in enumerate(paragraphs):
        if 'commentary' in p.text.lower() and not p.text.strip().lower().startswith('disclaimer'):
            heading_idx = i
            break
    if heading_idx is None:
        return

    # Находим до Disclaimer — empty paragraphs между двумя commentary body'ями
    to_remove = []
    seen_first_body = False
    for j in range(heading_idx + 1, len(paragraphs)):
        p = paragraphs[j]
        text = p.text.strip()
        if 'disclaimer' in text.lower():
            break
        if not text:
            if seen_first_body:
                to_remove.append(p)
        else:
            seen_first_body = True

    for p in to_remove:
        p._element.getparent().remove(p._element)


def _strip_trailing_empty_paragraphs(doc: Document):
    """Убирает trailing пустые параграфы (в т.ч. со стилями заголовков), которые
    добавляют лишний вертикальный пробел и могут выкинуть контент на 2-ю страницу.
    Word требует хотя бы один <w:p> перед <w:sectPr>, поэтому один минимальный оставляем."""
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    body = doc.element.body
    children = list(body)

    # найти sectPr
    sect_idx = None
    for i, child in enumerate(children):
        if child.tag == W + 'sectPr':
            sect_idx = i
            break
    if sect_idx is None:
        return

    # собрать trailing пустые параграфы (перед sectPr)
    trailing_empty = []
    for i in range(sect_idx - 1, -1, -1):
        child = children[i]
        if child.tag != W + 'p':
            break
        text = ''.join(t.text or '' for t in child.iter(W + 't')).strip()
        if text:
            break
        trailing_empty.append(child)

    if not trailing_empty:
        return

    # удалить все кроме одного — Word требует финальный параграф перед sectPr
    for p in trailing_empty[1:]:
        body.remove(p)

    # у последнего оставшегося — снять style (например heading2), чтобы не добавлял отступ
    keeper = trailing_empty[0]
    pPr = keeper.find(W + 'pPr')
    if pPr is not None:
        for pStyle in pPr.findall(W + 'pStyle'):
            pPr.remove(pStyle)


def _replace_fund_name(doc: Document, fund_letter: str):
    """Заменяет 'Sub-Fund X' на 'Sub-Fund <fund_letter>' в заголовочном параграфе."""
    if not fund_letter:
        return
    fund_letter = fund_letter.strip().upper()
    for p in doc.paragraphs:
        if 'sub-fund' not in p.text.lower():
            continue
        for r in p.runs:
            if 'sub-fund' in r.text.lower():
                r.text = re.sub(
                    r'Sub-Fund\s+[A-Z]',
                    f'Sub-Fund {fund_letter}',
                    r.text,
                    flags=re.IGNORECASE,
                )
        return


def _replace_reporting_date(doc: Document, reporting_date: str):
    """Заменяет 'Reporting Date: ...' в заголовке документа.
    Заголовочный параграф — многоstrочный (Investor Statement / Fund name / Reporting Date).
    Меняем только хвост «Reporting Date: X», сохраняя предыдущие runs."""
    for p in doc.paragraphs:
        if 'reporting date' not in p.text.lower():
            continue
        target_idx = None
        for i, r in enumerate(p.runs):
            if 'reporting date' in r.text.lower():
                target_idx = i
                break
        if target_idx is None:
            continue
        original = p.runs[target_idx].text
        # Сохраняем ведущие пробельные символы (обычно '\n')
        prefix = ''
        for ch in original:
            if ch in ('\n', '\r', '\t', ' '):
                prefix += ch
            else:
                break
        p.runs[target_idx].text = f'{prefix}Reporting Date: {reporting_date}'
        for r in p.runs[target_idx + 1:]:
            r.text = ''
        return


def _replace_disclaimer_date(doc: Document, reporting_date: str):
    """Заменяет дату в дисклеймере: 'as of <дата>.'"""
    for p in doc.paragraphs:
        text_lower = p.text.lower()
        if 'valuation as of' in text_lower or 'prepared by neomarkets' in text_lower:
            new_text = re.sub(
                r'as of\s+[^.]+',
                f'as of {reporting_date}',
                p.text,
                flags=re.IGNORECASE,
            )
            if new_text != p.text and p.runs:
                p.runs[0].text = new_text
                for r in p.runs[1:]:
                    r.text = ''


def generate_docx(template_path: str, report: FundReport, investor: InvestorPosition,
                  output_path: str, commentary: Optional[str] = None,
                  fund_letter: Optional[str] = None,
                  reporting_date_override: Optional[str] = None):
    """Генерирует один .docx для указанного инвестора на основе шаблона.

    fund_letter — A/B/C/G/H, подменит 'Sub-Fund G' в заголовке. Если None — оставит как в шаблоне.
    reporting_date_override — переопределит отчётную дату в заголовке и дисклеймере.
    """
    doc = Document(template_path)
    fund = report.fund

    reporting_date = reporting_date_override or report.reporting_date

    _replace_reporting_date(doc, reporting_date)
    if fund_letter:
        _replace_fund_name(doc, fund_letter)

    # ---- Таблица 0: Executive Summary ----
    exec_table = doc.tables[0]
    values = {
        'Total Assets': _fmt_usd_en(fund.assets),
        'Net Asset Value (NAV)': _fmt_usd_en(fund.nav),
        'Expenses': _fmt_usd_en(fund.expenses),
        'NAV per Unit': (f'NAV per Unit ({fund.nav_per_unit_end_date})',
                         f'USD {fund.nav_per_unit_end:.2f}'),
        'Monthly Growth': _fmt_pct_ru(fund.monthly_change_pct),
    }
    for row in exec_table.rows[1:]:
        label_cell = row.cells[0]
        label_text = label_cell.text.strip()
        matched_key = next((k for k in values if label_text.lower().startswith(k.lower())), None)
        if not matched_key:
            continue
        val = values[matched_key]
        if isinstance(val, tuple):
            _set_cell_text(label_cell, val[0])
            _set_cell_text(row.cells[1], val[1])
        else:
            _set_cell_text(row.cells[1], val)

    # ---- Таблица 1: Investor Position ----
    inv_table = doc.tables[1]
    updates = {
        'Investor': investor.name,
        'Subscription Amount': _fmt_usd_en(investor.total_subscription),
        'Subscription NAV': f'USD {investor.avg_subscription_price:.2f}',
        'Fund Units': f'{investor.total_units:,.2f}',
        'Current NAV per Unit': f'USD {fund.nav_per_unit_end:.2f}',
        'Current Investment Value': _fmt_usd_ru(investor.current_value),
    }
    for row in inv_table.rows[1:]:
        label = row.cells[0].text.strip()
        matched = next((k for k in updates if label.startswith(k)), None)
        if matched:
            _set_cell_text(row.cells[1], updates[matched])

    _ensure_income_rows(inv_table, report, investor)

    _replace_commentary(doc, commentary, growth_pct=fund.monthly_change_pct)

    _replace_disclaimer_date(doc, reporting_date)

    _collapse_empty_between_commentary(doc)
    _strip_trailing_empty_paragraphs(doc)

    doc.save(output_path)


def sanitize_filename(name: str) -> str:
    name = re.sub(r'[^\w\s-]', '', name, flags=re.UNICODE)
    name = re.sub(r'\s+', '_', name.strip())
    return name or 'investor'


# ============================================================
# ГЕНЕРАЦИЯ EXCEL-ШАБЛОНА ДЛЯ ЗАГРУЗКИ
# ============================================================

def build_investor_sheet(ws, investor_name: str, nav_start: float = 53.5240,
                         nav_end: float = 53.8151,
                         start_date: str = '31.07.2026',
                         end_date: str = '31.08.2026'):
    """Заполняет один лист в стиле «В разбивке инвестор ...» — метки в столбце B,
    значения в столбце C (соответствует парсеру ТЗ 6.5.5)."""
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    bold = Font(bold=True)
    header_fill = PatternFill('solid', fgColor='FFF2E5D8')
    grey_fill = PatternFill('solid', fgColor='FFEFEFEF')
    thin = Side(border_style='thin', color='FFBFBFBF')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal='center', vertical='center', wrap_text=True)

    # Секция показателей фонда (столбцы B/C)
    fund_rows = [
        ('Assets', 5_540_835.25),
        ('Expenses', 28_294.06),
        ('NAV', 5_512_541.19),
        (f'NAV per unit {start_date}', nav_start),
        (f'NAV per unit {end_date}', nav_end),
        ('The change NAV per share', round(nav_end / nav_start - 1, 6)),
    ]
    for i, (label, value) in enumerate(fund_rows, start=1):
        ws.cell(row=i, column=2, value=label).font = bold
        ws.cell(row=i, column=3, value=value)

    # Пустая строка-разделитель
    header_row = len(fund_rows) + 3  # обычно 9

    # Таблица позиции инвестора — 8 колонок как в исходном формате фонда
    headers = [
        'Инвестор',                                                      # A
        'Первоначальная сумма взноса в оплату юнитов Фонда',              # B
        'Стоимость 1 акции в момент подписки',                            # C
        'Количество акций',                                               # D
        f'Стоимость 1 акции за {end_date}',                               # E
        f'Текущая стоимость активов инвестора за {end_date}',              # F
        'Доход/убыток инвестора за текущий месяц',                        # G
        'Доход/убыток инвестора с момента инвестиции',                    # H
    ]
    for j, h in enumerate(headers, start=1):
        c = ws.cell(row=header_row, column=j, value=h)
        c.font = bold
        c.fill = header_fill
        c.alignment = center
        c.border = border

    # Одна строка-плейсхолдер с формулами
    data_row = header_row + 1
    ws.cell(row=data_row, column=1, value=investor_name)
    ws.cell(row=data_row, column=2, value=199985.00)      # сумма подписки
    ws.cell(row=data_row, column=3, value=49.24)          # цена входа
    ws.cell(row=data_row, column=4, value=4061.36)        # паи
    ws.cell(row=data_row, column=5, value=nav_end)        # NAV end
    ws.cell(row=data_row, column=6, value=f'=D{data_row}*E{data_row}')   # текущая ст-ть
    ws.cell(row=data_row, column=7, value=f'=F{data_row}-D{data_row}*C{data_row}')  # доход за месяц (по Variant B — прибл.)
    ws.cell(row=data_row, column=8, value=f'=F{data_row}-B{data_row}')    # доход с момента инвест.

    # Итоговая строка (парсер её игнорирует по правилу empty-row)
    total_row = data_row + 1
    ws.cell(row=total_row, column=1, value='Итого').font = bold
    for j in (2, 4, 6, 7, 8):
        ws.cell(row=total_row, column=j,
                value=f'=SUM({chr(64 + j)}{data_row}:{chr(64 + j)}{data_row})').font = bold
    for row in ws.iter_rows(min_row=header_row, max_row=total_row,
                            min_col=1, max_col=8):
        for cell in row:
            cell.border = border

    # Ширины колонок
    widths = {1: 26, 2: 34, 3: 30, 4: 16, 5: 26, 6: 30, 7: 30, 8: 32}
    for col_idx, w in widths.items():
        ws.column_dimensions[chr(64 + col_idx)].width = w


def build_period_sheet(ws, investor_names: list[str],
                       start_date: str = '31.07.2026', end_date: str = '31.08.2026'):
    """Лист «за <текущий год>» — здесь берётся Дата ввода для fuzzy-матчинга."""
    from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

    bold = Font(bold=True)
    header_fill = PatternFill('solid', fgColor='FFDDEBF7')
    thin = Side(border_style='thin', color='FFBFBFBF')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal='center', vertical='center', wrap_text=True)

    ws['A1'] = f'Сводная таблица за отчётный период до {end_date}'
    ws['A1'].font = Font(bold=True, size=12)

    headers = [
        'Инвестор',
        'Дата ввода',
        'Первоначальная сумма',
        'Стоимость 1 акции при подписке',
        'Количество акций',
        f'Стоимость на {end_date}',
        'Доход/убыток',
    ]
    header_row = 3
    for j, h in enumerate(headers, start=1):
        c = ws.cell(row=header_row, column=j, value=h)
        c.font = bold
        c.fill = header_fill
        c.alignment = center
        c.border = border

    # Заполняем плейсхолдерами по одному траншу на инвестора
    for i, name in enumerate(investor_names, start=header_row + 1):
        ws.cell(row=i, column=1, value=name)
        ws.cell(row=i, column=2, value=45778)  # 04.05.2026 as Excel serial
        ws.cell(row=i, column=3, value=100000.00)
        ws.cell(row=i, column=4, value=50.00)
        ws.cell(row=i, column=5, value=2000.00)
        ws.cell(row=i, column=6, value=f'=E{i}*{53.8151}')
        ws.cell(row=i, column=7, value=f'=F{i}-C{i}')
        for j in range(1, 8):
            ws.cell(row=i, column=j).border = border

    widths = {1: 28, 2: 14, 3: 22, 4: 26, 5: 18, 6: 24, 7: 18}
    for col_idx, w in widths.items():
        ws.column_dimensions[chr(64 + col_idx)].width = w


def generate_template_xlsx(mode: str = 'consolidated') -> bytes:
    """Создаёт пустой Excel-шаблон, совместимый с парсером.

    Оба режима содержат только листы «В разбивке инвестор ФИО» —
    без вспомогательных листов «за август» и «Активы».
    mode='consolidated' — 3 листа-примера, пользователь может добавить/удалить.
    mode='single' — 1 лист для одного инвестора.
    """
    from openpyxl import Workbook

    wb = Workbook()
    wb.remove(wb.active)

    if mode == 'single':
        ws = wb.create_sheet('В разбивке инвестор Пример')
        build_investor_sheet(ws, 'Ivan Ivanov')
    else:
        # Имена короткие — чтобы `В разбивке инвестор <name>` умещалось в 31 символ
        example_names = ['Ivan Ivanov', 'Petr Petrov', 'Anna Popova']
        for name in example_names:
            ws = wb.create_sheet(f'В разбивке инвестор {name}')
            build_investor_sheet(ws, name)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


# ============================================================
# СЕРИАЛИЗАЦИЯ ДЛЯ API
# ============================================================

def report_to_dict(report: FundReport) -> dict:
    """FundReport → JSON-совместимая структура для превью."""
    return {
        'reporting_date': report.reporting_date,
        'unrecognized_sheets': report.unrecognized_sheets,
        'fund': {
            'assets': report.fund.assets,
            'expenses': report.fund.expenses,
            'nav': report.fund.nav,
            'nav_per_unit_start': report.fund.nav_per_unit_start,
            'nav_per_unit_end': report.fund.nav_per_unit_end,
            'nav_per_unit_start_date': report.fund.nav_per_unit_start_date,
            'nav_per_unit_end_date': report.fund.nav_per_unit_end_date,
            'monthly_change_pct': report.fund.monthly_change_pct,
        },
        'investors': [
            {
                'name': inv.name,
                'tranches_count': len(inv.tranches),
                'total_subscription': inv.total_subscription,
                'total_units': inv.total_units,
                'avg_subscription_price': inv.avg_subscription_price,
                'earliest_subscription_date': inv.earliest_subscription_date,
                'current_value': inv.current_value,
                'monthly_income': inv.monthly_income,
                'monthly_income_pct': inv.monthly_income_pct,
                'total_income': inv.total_income,
                'total_income_pct': inv.total_income_pct,
                'tranches': [
                    {
                        'subscription_date': t.subscription_date,
                        'subscription_amount': t.subscription_amount,
                        'subscription_price': t.subscription_price,
                        'units': t.units,
                    }
                    for t in inv.tranches
                ],
            }
            for inv in report.investors
        ],
    }


def report_from_dict(data: dict) -> FundReport:
    """Обратная сериализация — для endpoint /generate."""
    fund_data = data['fund']
    fund = FundMetrics(
        assets=float(fund_data['assets']),
        expenses=float(fund_data['expenses']),
        nav=float(fund_data['nav']),
        nav_per_unit_start=float(fund_data['nav_per_unit_start']),
        nav_per_unit_end=float(fund_data['nav_per_unit_end']),
        nav_per_unit_start_date=str(fund_data['nav_per_unit_start_date']),
        nav_per_unit_end_date=str(fund_data['nav_per_unit_end_date']),
        monthly_change_pct=float(fund_data['monthly_change_pct']),
    )
    investors = []
    for inv_data in data['investors']:
        tranches = [
            InvestorTranche(
                subscription_date=t.get('subscription_date'),
                subscription_amount=float(t['subscription_amount']),
                subscription_price=float(t['subscription_price']),
                units=float(t['units']),
            )
            for t in inv_data.get('tranches', [])
        ]
        pos = InvestorPosition(name=str(inv_data['name']), tranches=tranches)
        pos.total_subscription = float(inv_data['total_subscription'])
        pos.total_units = float(inv_data['total_units'])
        pos.avg_subscription_price = float(inv_data['avg_subscription_price'])
        pos.earliest_subscription_date = inv_data.get('earliest_subscription_date')
        pos.current_value = float(inv_data['current_value'])
        pos.monthly_income = float(inv_data['monthly_income'])
        pos.monthly_income_pct = float(inv_data['monthly_income_pct'])
        pos.total_income = float(inv_data['total_income'])
        pos.total_income_pct = float(inv_data['total_income_pct'])
        investors.append(pos)

    return FundReport(
        fund=fund,
        investors=investors,
        reporting_date=str(data['reporting_date']),
        unrecognized_sheets=list(data.get('unrecognized_sheets') or []),
    )
