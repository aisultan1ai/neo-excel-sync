"""
Reference implementation для модуля отчётов инвесторов.
Парсит сводный Excel фонда и генерирует Word-отчёты по утверждённому шаблону.

Использование:
    python fund_report_generator.py <path_to_excel.xls> <path_to_template.docx> <output_dir>

Пример:
    python fund_report_generator.py august_2026.xls Investor_Report_TEMPLATE.docx ./reports/

Зависимости:
    pip install xlrd==2.0.1 openpyxl pandas python-docx lxml

Автор: подготовлено как reference для Claude Code
"""

import os
import re
import sys
import zipfile
import argparse
from copy import deepcopy
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional

import xlrd  # для .xls
from openpyxl import load_workbook  # для .xlsx
from docx import Document
from docx.shared import RGBColor
from docx.oxml.ns import qn
from lxml import etree


# ============================================================
# МОДЕЛИ ДАННЫХ
# ============================================================

@dataclass
class FundMetrics:
    """Показатели фонда за отчётный период."""
    assets: float                    # Total Assets
    expenses: float                  # Expenses
    nav: float                       # Net Asset Value
    nav_per_unit_start: float        # цена пая на начало месяца
    nav_per_unit_end: float          # цена пая на конец месяца
    nav_per_unit_start_date: str     # напр. "31.07.2026"
    nav_per_unit_end_date: str       # напр. "31.08.2026"
    monthly_change_pct: float        # изменение цены пая, %


@dataclass
class InvestorTranche:
    """Один транш инвестора."""
    subscription_date: Optional[str]     # DD.MM.YYYY, может быть None если не нашли
    subscription_amount: float           # $
    subscription_price: float            # $ за пай при покупке
    units: float                         # количество паёв


@dataclass
class InvestorPosition:
    """Полная позиция инвестора (может состоять из нескольких траншей)."""
    name: str                            # ФИО как в файле
    tranches: list[InvestorTranche] = field(default_factory=list)

    # Агрегаты (посчитаются в calculate())
    total_subscription: float = 0.0
    total_units: float = 0.0
    avg_subscription_price: float = 0.0
    earliest_subscription_date: Optional[str] = None
    current_value: float = 0.0
    monthly_income: float = 0.0
    monthly_income_pct: float = 0.0
    total_income: float = 0.0
    total_income_pct: float = 0.0

    def calculate(self, fund: FundMetrics):
        """Пересчитывает агрегаты по всем траншам."""
        self.total_subscription = sum(t.subscription_amount for t in self.tranches)
        self.total_units = sum(t.units for t in self.tranches)
        if self.total_units > 0:
            self.avg_subscription_price = self.total_subscription / self.total_units
        # Самая ранняя дата подписки
        dates = [t.subscription_date for t in self.tranches if t.subscription_date]
        if dates:
            self.earliest_subscription_date = min(
                dates, key=lambda d: datetime.strptime(d, '%d.%m.%Y')
            )
        # Текущая стоимость
        self.current_value = self.total_units * fund.nav_per_unit_end

        # Стоимость на начало отчётного месяца.
        # Для траншей, которые были в фонде на начало месяца (subscription_date <= start_date),
        # используем units × NAV_start. Для новых подписок этого месяца — subscription_amount.
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

        self.monthly_income = self.current_value - value_start
        if value_start > 0:
            self.monthly_income_pct = (self.current_value / value_start - 1) * 100

        # Доход с даты входа
        self.total_income = self.current_value - self.total_subscription
        if self.total_subscription > 0:
            self.total_income_pct = (self.current_value / self.total_subscription - 1) * 100


@dataclass
class FundReport:
    """Собранные данные из одного месячного Excel."""
    fund: FundMetrics
    investors: list[InvestorPosition]
    reporting_date: str  # напр. "31 August 2026"


# ============================================================
# ПАРСИНГ EXCEL
# ============================================================

INVESTOR_SHEET_PREFIX = 'в разбивке инвестор'  # регистронезависимо

def _norm(s: str) -> str:
    """Нормализует строку: strip + lower + схлопывание пробелов."""
    if s is None: return ''
    return re.sub(r'\s+', ' ', str(s)).strip().lower()

def _excel_date(serial) -> Optional[str]:
    """Excel serial number → DD.MM.YYYY."""
    if serial is None or serial == '': return None
    try:
        d = datetime(1899, 12, 30) + timedelta(days=int(float(serial)))
        return d.strftime('%d.%m.%Y')
    except (ValueError, TypeError):
        return None

def _num(v) -> Optional[float]:
    """Безопасное приведение к float."""
    if v is None or v == '': return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


class ExcelParser:
    """Универсальный парсер, поддерживает и .xls, и .xlsx."""

    def __init__(self, path: str):
        self.path = path
        self.ext = os.path.splitext(path)[1].lower()
        self._sheets = self._load_all_sheets()

    def _load_all_sheets(self) -> dict[str, list[list]]:
        """Возвращает {sheet_name: [[cell, cell, ...], ...]}."""
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
        """Возвращает [(sheet_name, investor_name_from_sheet), ...]."""
        prefixes = [INVESTOR_SHEET_PREFIX]
        if extra_prefixes:
            prefixes += [p.lower() for p in extra_prefixes]

        result = []
        for name in self._sheets.keys():
            norm = _norm(name)
            for p in prefixes:
                if norm.startswith(p):
                    inv_name = name[len(p):].strip().rstrip('.').strip()
                    # Восстановим исходный регистр — берём из оригинального имени, а не нормализованного
                    orig_idx = _norm(name).find(p) + len(p)
                    inv_name = name[orig_idx:].strip().rstrip('.').strip()
                    result.append((name, inv_name))
                    break
        return result


def parse_fund_metrics(rows: list[list]) -> FundMetrics:
    """Парсит показатели фонда из листа инвестора (первые ~10 строк).
    Метки могут быть в любой колонке, значение берём из следующей непустой."""

    def value_after_label(row: list, label_col_idx: int):
        """Возвращает первое непустое значение справа от метки."""
        for j in range(label_col_idx + 1, len(row)):
            v = _num(row[j])
            if v is not None:
                return v
        return None

    def find_label(labels: list[str]) -> Optional[float]:
        """Ищет любую ячейку с меткой (регистронезависимо), возвращает значение справа."""
        wanted = [_norm(l) for l in labels]
        for row in rows:
            for j, cell in enumerate(row):
                label = _norm(cell)
                if not label: continue
                if label in wanted or any(label.startswith(w) for w in wanted):
                    val = value_after_label(row, j)
                    if val is not None:
                        return val
        return None

    def find_nav_per_unit_rows() -> list[tuple[str, float]]:
        """Возвращает все ячейки 'NAV per unit <date>' → (дата, значение)."""
        result = []
        pattern = re.compile(r'^nav per unit\s*(.*)$', re.IGNORECASE)
        for row in rows:
            for j, cell in enumerate(row):
                if cell is None: continue
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

    # Сортируем по дате (DD.MM.YYYY)
    def date_key(item):
        try:
            return datetime.strptime(item[0], '%d.%m.%Y')
        except ValueError:
            return datetime.min
    nav_rows_sorted = sorted(nav_rows, key=date_key)

    return FundMetrics(
        assets=find_label(['Assets']) or 0,
        expenses=find_label(['Expenses']) or 0,
        nav=find_label(['NAV']) or 0,
        nav_per_unit_start=nav_rows_sorted[0][1],
        nav_per_unit_end=nav_rows_sorted[-1][1],
        nav_per_unit_start_date=nav_rows_sorted[0][0],
        nav_per_unit_end_date=nav_rows_sorted[-1][0],
        monthly_change_pct=(nav_rows_sorted[-1][1] / nav_rows_sorted[0][1] - 1) * 100,
    )


def parse_investor_tranches(rows: list[list], investor_name: str,
                            subscription_dates: list[dict]) -> list[InvestorTranche]:
    """Парсит все транши инвестора из его листа.
    subscription_dates — список траншей со сводных листов для fuzzy-матчинга даты."""

    # Ищем заголовок таблицы: строка содержит ячейку начинающуюся с "Инве"
    header_idx = None
    header_row = None
    for i, row in enumerate(rows):
        for cell in row:
            if _norm(cell).startswith('инве'):
                header_idx = i
                header_row = row
                break
        if header_idx is not None: break
    if header_idx is None:
        raise ValueError(f"Не найден заголовок таблицы позиции инвестора.")

    # Определяем индексы нужных колонок по заголовкам
    col_name = col_amount = col_price = col_units = None
    for j, cell in enumerate(header_row):
        c = _norm(cell)
        if not c: continue
        if c.startswith('инве') and col_name is None: col_name = j
        elif ('первоначальная сумма' in c or c.startswith('сумма')) and col_amount is None: col_amount = j
        elif ('стоимость 1 акции' in c and ('подпис' in c or 'номинал' in c)) and col_price is None: col_price = j
        elif 'количество' in c and col_units is None: col_units = j

    if None in (col_name, col_amount, col_price, col_units):
        raise ValueError(
            f"Не удалось определить колонки таблицы. "
            f"name={col_name}, amount={col_amount}, price={col_price}, units={col_units}"
        )

    tranches = []
    for row in rows[header_idx + 1:]:
        if len(row) <= max(col_amount, col_price, col_units): continue
        amount = _num(row[col_amount])
        price = _num(row[col_price])
        units = _num(row[col_units])
        if amount is None or price is None or units is None:
            continue

        # Дата входа — fuzzy-матчинг по (amount, price, units) — независимо от языка ФИО
        date = find_subscription_date(subscription_dates, amount, price, units)

        tranches.append(InvestorTranche(
            subscription_date=date,
            subscription_amount=amount,
            subscription_price=price,
            units=units,
        ))

    return tranches


def build_subscription_dates_map(parser: ExcelParser) -> list[dict]:
    """Собирает список траншей из сводных листов с датами подписки.
    Каждая запись: {'amount': ..., 'price': ..., 'units': ..., 'date': 'DD.MM.YYYY'}
    Возвращаем список (а не dict), потому что матчинг делаем с погрешностью."""

    result = []
    candidate_sheets = ['за текущий год', 'Performance fee 15%_', 'за июль', 'за август']
    for sheet_name in parser.sheet_names():
        if _norm(sheet_name) not in [_norm(s) for s in candidate_sheets]: continue
        rows = parser.rows(sheet_name)
        for i, row in enumerate(rows):
            date_col = amount_col = price_col = units_col = None
            for j, cell in enumerate(row):
                c = _norm(cell)
                if c == 'дата ввода': date_col = j
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
                if len(data_row) <= max(date_col, amount_col, price_col): break
                if any(_norm(c).startswith('инве') for c in data_row): break
                amount = _num(data_row[amount_col])
                price = _num(data_row[price_col])
                units = _num(data_row[units_col]) if units_col is not None else None
                date = _excel_date(data_row[date_col])
                if amount is None and price is None: break
                if amount is not None and price is not None and date is not None:
                    batch.append({'amount': amount, 'price': price,
                                  'units': units, 'date': date})
            if batch:
                result = batch  # берём самую последнюю таблицу — приоритет актуальным данным
            break
    return result


def find_subscription_date(tranches_index: list[dict], amount: float, price: float,
                           units: float = None) -> Optional[str]:
    """Fuzzy-матчинг: сначала по (amount ± $0.01, price ± $0.05),
    потом по (amount ± $0.01, ближайшая price)."""
    # 1. Точное совпадение
    for t in tranches_index:
        if abs(t['amount'] - amount) < 0.01 and abs(t['price'] - price) < 0.001:
            return t['date']
    # 2. Совпадение с погрешностью
    matches = [t for t in tranches_index if abs(t['amount'] - amount) < 0.01]
    if not matches:
        return None
    # Если только одно совпадение — берём его
    if len(matches) == 1:
        return matches[0]['date']
    # Иначе — ближайшая price (и если units известен — то и units)
    def dist(t):
        d = abs(t['price'] - price)
        if units is not None and t['units'] is not None:
            d += abs(t['units'] - units) * 0.001  # units в приоритете
        return d
    best = min(matches, key=dist)
    if abs(best['price'] - price) < 0.5:  # разумная погрешность
        return best['date']
    return None


def parse_fund_report(xlsx_path: str, extra_prefixes: list[str] = None) -> FundReport:
    """Главная точка входа. Возвращает готовую структуру FundReport."""
    parser = ExcelParser(xlsx_path)
    sub_dates_map = build_subscription_dates_map(parser)

    investor_sheets = parser.investor_sheets(extra_prefixes=extra_prefixes)
    if not investor_sheets:
        raise ValueError(
            "В файле не найдено ни одного листа с инвестором. "
            "Ожидались листы, начинающиеся с 'В разбивке инвестор'."
        )

    fund = None
    investors = []
    for sheet_name, inv_name_from_sheet in investor_sheets:
        rows = parser.rows(sheet_name)

        # Первый пройденный лист даёт fund metrics (они одинаковые во всех)
        if fund is None:
            fund = parse_fund_metrics(rows)

        tranches = parse_investor_tranches(rows, inv_name_from_sheet, sub_dates_map)
        # Реальное имя инвестора берём из первой data-строки таблицы позиции
        real_name = None
        # Найти заголовок и первую data-строку
        for i, row in enumerate(rows):
            for j, cell in enumerate(row):
                if _norm(cell).startswith('инве'):
                    # Проверим data-строки ниже
                    for data_row in rows[i + 1:]:
                        if len(data_row) > j and data_row[j] and _num(data_row[j]) is None:
                            real_name = str(data_row[j]).strip()
                            break
                    break
            if real_name: break

        pos = InvestorPosition(name=real_name or inv_name_from_sheet, tranches=tranches)
        pos.calculate(fund)
        investors.append(pos)

    end_date = fund.nav_per_unit_end_date  # DD.MM.YYYY
    try:
        d = datetime.strptime(end_date, '%d.%m.%Y')
        reporting_date = d.strftime('%d %B %Y')  # 31 August 2026
    except ValueError:
        reporting_date = end_date

    return FundReport(fund=fund, investors=investors, reporting_date=reporting_date)


# ============================================================
# ГЕНЕРАЦИЯ WORD-ОТЧЁТА
# ============================================================

GREEN_HEX = '1E7B34'
RED_HEX = 'B22222'


def _fmt_usd_en(x: float, decimals=2) -> str:
    """USD 5,540,835.25 — англ. формат для Executive Summary."""
    return f'USD {x:,.{decimals}f}'


def _fmt_usd_ru(x: float, decimals=2) -> str:
    """USD 1 182,30 — неразрывный пробел + запятая (для строк дохода)."""
    return f'USD {x:,.{decimals}f}'.replace(',', '\u00A0').replace('.', ',')


def _fmt_pct_ru(x: float, decimals=2, sign=True) -> str:
    """+0,54% или -0,54%."""
    sign_char = ('+' if x >= 0 else '') if sign else ''
    return f'{sign_char}{x:.{decimals}f}%'.replace('.', ',')


def _clone_row_replacing_text(template_row, texts: list[str],
                              colored_value_index: Optional[int] = None,
                              color_hex: str = GREEN_HEX,
                              bold: bool = False):
    """Клонирует строку таблицы, заменяет текст, опционально красит ячейку value."""
    new_tr = deepcopy(template_row._tr)
    orig_tcs = template_row._tr.findall(qn('w:tc'))
    new_tcs = new_tr.findall(qn('w:tc'))

    for i, (tc, text) in enumerate(zip(new_tcs, texts)):
        # Очищаем содержимое, оставляя один параграф
        paragraphs = tc.findall(qn('w:p'))
        for p in paragraphs[1:]:
            tc.remove(p)
        p = paragraphs[0]
        for run in p.findall(qn('w:r')):
            p.remove(run)

        # Копируем run из исходной ячейки
        orig_p = orig_tcs[i].find(qn('w:p'))
        orig_run = orig_p.find(qn('w:r')) if orig_p is not None else None
        if orig_run is not None:
            new_run = deepcopy(orig_run)
            for t in new_run.findall(qn('w:t')):
                new_run.remove(t)
            new_t = etree.SubElement(new_run, qn('w:t'))
            new_t.text = text
            new_t.set(qn('xml:space'), 'preserve')

            # Красим и делаем жирным при необходимости
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


def generate_docx(template_path: str, report: FundReport, investor: InvestorPosition,
                  output_path: str, commentary: str = None):
    """Генерирует один .docx для указанного инвестора на основе шаблона."""
    doc = Document(template_path)
    fund = report.fund

    # ---- Таблица 0: Executive Summary ----
    # Порядок строк в шаблоне: [Indicator/Value | Total Assets | NAV | Expenses | NAV per Unit | Monthly Growth]
    exec_table = doc.tables[0]
    values = {
        'Total Assets': _fmt_usd_en(fund.assets),
        'Net Asset Value (NAV)': _fmt_usd_en(fund.nav),
        'Expenses': _fmt_usd_en(fund.expenses),
        # Заменяем и метку, и значение (дата в метке актуальная)
        'NAV per Unit': (f'NAV per Unit ({fund.nav_per_unit_end_date})',
                        f'USD {fund.nav_per_unit_end:.2f}'),
        'Monthly Growth': _fmt_pct_ru(fund.monthly_change_pct),
    }
    for row in exec_table.rows[1:]:
        label_cell = row.cells[0]
        label_text = label_cell.text.strip()
        matched_key = next((k for k in values if label_text.lower().startswith(k.lower())), None)
        if not matched_key: continue
        val = values[matched_key]
        if isinstance(val, tuple):
            _set_cell_text(label_cell, val[0])
            _set_cell_text(row.cells[1], val[1])
        else:
            _set_cell_text(row.cells[1], val)

    # ---- Таблица 1: Investor Position ----
    inv_table = doc.tables[1]
    # Обновляем существующие строки
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
        matched = next((k for k, v in updates.items() if label.startswith(k)), None)
        if matched:
            _set_cell_text(row.cells[1], updates[matched])

    # Добавляем строки дохода (если их ещё нет — иначе перезаписываем)
    _ensure_income_rows(inv_table, report, investor)

    # ---- Комментарий управляющего (опционально) ----
    if commentary:
        _replace_commentary(doc, commentary)

    doc.save(output_path)


def _set_cell_text(cell, new_text: str):
    """Заменяет текст ячейки, сохраняя форматирование первого run."""
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
            # Удаляем лишние параграфы через XML
            p._element.getparent().remove(p._element)


def _ensure_income_rows(inv_table, report: FundReport, investor: InvestorPosition):
    """Добавляет / обновляет строки Income for <month> и Total Income since Subscription."""
    fund = report.fund
    try:
        d = datetime.strptime(fund.nav_per_unit_end_date, '%d.%m.%Y')
        month_label = d.strftime('%B %Y')  # August 2026
    except ValueError:
        month_label = fund.nav_per_unit_end_date

    monthly_str = f'+{_fmt_usd_ru(investor.monthly_income)}  ({_fmt_pct_ru(investor.monthly_income_pct)})'
    if investor.monthly_income < 0:
        monthly_str = f'−{_fmt_usd_ru(abs(investor.monthly_income))}  ({_fmt_pct_ru(investor.monthly_income_pct)})'

    total_str = f'+{_fmt_usd_ru(investor.total_income)}  ({_fmt_pct_ru(investor.total_income_pct)})'
    if investor.total_income < 0:
        total_str = f'−{_fmt_usd_ru(abs(investor.total_income))}  ({_fmt_pct_ru(investor.total_income_pct)})'

    labels_and_values = [
        (f'Income for {month_label}', monthly_str, investor.monthly_income),
        (f'Total Income since Subscription ({investor.earliest_subscription_date or "—"})',
         total_str, investor.total_income),
    ]

    tbl_element = inv_table._tbl
    tpl_row = inv_table.rows[-1]

    for label, value, amount in labels_and_values:
        # Проверяем — есть ли уже такая строка (по префиксу метки)
        existing = None
        for row in inv_table.rows:
            if row.cells[0].text.strip().startswith(label.split('(')[0].strip()):
                existing = row
                break
        color = GREEN_HEX if amount >= 0 else RED_HEX
        if existing is not None:
            _set_cell_text(existing.cells[0], label)
            _set_cell_text(existing.cells[1], value)
        else:
            new_row = _clone_row_replacing_text(
                tpl_row, [label, value],
                colored_value_index=1, color_hex=color, bold=True,
            )
            tbl_element.append(new_row)


def _replace_commentary(doc: Document, commentary: str):
    """Заменяет комментарий управляющего на новый текст.
    Ищет параграф после 'Manager's Commentary' и заменяет."""
    paragraphs = doc.paragraphs
    for i, p in enumerate(paragraphs):
        if "commentary" in p.text.lower():
            # Заменим следующие 2 параграфа новым текстом
            for j in range(i + 1, min(i + 3, len(paragraphs))):
                if paragraphs[j].text.strip() and not paragraphs[j].text.startswith('Disclaimer'):
                    for run in paragraphs[j].runs:
                        run.text = ''
                    if paragraphs[j].runs:
                        paragraphs[j].runs[0].text = commentary if j == i + 1 else ''
                    break
            break


# ============================================================
# CLI
# ============================================================

def sanitize_filename(name: str) -> str:
    """ФИО → безопасное имя файла."""
    name = re.sub(r'[^\w\s-]', '', name, flags=re.UNICODE)
    name = re.sub(r'\s+', '_', name.strip())
    return name


def main():
    ap = argparse.ArgumentParser(description='Генератор отчётов инвесторов фонда')
    ap.add_argument('xlsx', help='Путь к сводному Excel фонда (.xls/.xlsx)')
    ap.add_argument('template', help='Путь к шаблону Word (.docx)')
    ap.add_argument('output_dir', help='Папка для сохранения отчётов')
    ap.add_argument('--commentary', help='Текст комментария управляющего (общий на всех)',
                    default=None)
    ap.add_argument('--extra-prefixes', nargs='*', default=[],
                    help='Доп. префиксы имён листов, которые считать листами инвесторов')
    args = ap.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print(f'📖 Парсим {args.xlsx}...')
    report = parse_fund_report(args.xlsx, extra_prefixes=args.extra_prefixes)
    print(f'   Отчётный период: {report.reporting_date}')
    print(f'   NAV фонда: {report.fund.nav:,.2f}')
    print(f'   Изменение цены пая: {_fmt_pct_ru(report.fund.monthly_change_pct)}')
    print(f'   Инвесторов: {len(report.investors)}')

    for investor in report.investors:
        out_name = f'Investor_Report_{sanitize_filename(investor.name)}_{report.reporting_date.replace(" ", "_")}.docx'
        out_path = os.path.join(args.output_dir, out_name)
        generate_docx(args.template, report, investor, out_path, commentary=args.commentary)
        print(f'   ✓ {investor.name}: доход за месяц {investor.monthly_income:+,.2f}, '
              f'всего {investor.total_income:+,.2f} → {out_name}')

    print(f'\n✅ Готово: {len(report.investors)} отчётов в {args.output_dir}')


if __name__ == '__main__':
    main()
