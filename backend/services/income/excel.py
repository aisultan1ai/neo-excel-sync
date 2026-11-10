"""Excel-выгрузка отчёта «Доходы» (структура как у ручного отчёта).

Пишется в потоковом режиме openpyxl (write_only): строки сразу уходят в файл,
поэтому десятки тысяч сделок выгружаются быстро и без лишней памяти.
Текст из Unity очищается: управляющие символы удаляются (иначе openpyxl падает),
строки, начинающиеся с «=», записываются как текст, а не как формула.
"""
from __future__ import annotations

import io

import openpyxl
from openpyxl.cell import WriteOnlyCell
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .rules import CATEGORIES, pair_label

_HEAD_FILL = PatternFill("solid", fgColor="1F4E79")
_HEAD_FONT = Font(bold=True, color="FFFFFF", size=10)
_HEAD_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)
_TOTAL_FILL = PatternFill("solid", fgColor="DDEBF7")
_TITLE_FONT = Font(bold=True, size=12, color="1F4E79")
_BIG_FONT = Font(bold=True, size=14, color="1F4E79")
_WARN_FILL = PatternFill("solid", fgColor="FFF2CC")
_BOLD = Font(bold=True)
NUM = "#,##0.00"
NUM6 = "#,##0.######"
_WIDTH_SAMPLE = 300          # по скольким строкам считать ширину колонок

MATCH_LABEL = {"execution": "Execution ID", "order": "Ордер провайдера", "auto": "Авто (время/объём)", "none": "Нет пары"}
KIND_LABEL = {"other": "Сделки", "conversion": "Конвертация", "crypto": "Крипта"}
SUB_LABEL = {"trades": "Сделки", "funding": "Funding fee", "markup": "Mark-up", "commission": "Комиссия",
             "spread": "Курсовая разница"}


def clean_text(v):
    """Убирает символы, недопустимые в XML/Excel."""
    if isinstance(v, str):
        return ILLEGAL_CHARACTERS_RE.sub("", v)
    return v


class Block:
    """Таблица на листе: заголовок, шапка, строки, итог по колонкам (формулой SUM)."""

    def __init__(self, headers, rows, num_cols=None, total_cols=None, title=None):
        self.headers = headers
        self.rows = rows
        self.num_cols = num_cols or {}
        self.total_cols = total_cols or []
        self.title = title


def _cell(ws, value, number_format=None, font=None, fill=None, align=None):
    value = clean_text(value)
    c = WriteOnlyCell(ws, value=value)
    if isinstance(value, str) and value.startswith("="):
        c.data_type = "s"          # данные из Unity — никогда не формула
    if number_format and isinstance(value, (int, float)):
        c.number_format = number_format
    if font:
        c.font = font
    if fill:
        c.fill = fill
    if align:
        c.alignment = align
    return c


def _widths(blocks, min_w=10, max_w=45) -> dict:
    w: dict = {}
    for b in blocks:
        for i, h in enumerate(b.headers, 1):
            w[i] = max(w.get(i, 0), min(len(str(h)), 25))
        for row in b.rows[:_WIDTH_SAMPLE]:
            for i, v in enumerate(row, 1):
                if v is None:
                    continue
                n = len(f"{v:,.2f}") if isinstance(v, float) else len(str(v))
                w[i] = max(w.get(i, 0), n)
    return {i: max(min_w, min(n + 2, max_w)) for i, n in w.items()}


def write_sheet(wb, name: str, blocks: list, header_lines: list | None = None,
                freeze: str | None = None, filter_block: int | None = None):
    """header_lines = [(text, font, fill)] — строки над таблицами.
    freeze — ячейка закрепления относительно шапки первой таблицы, например "C" → закрепить колонки A:B и шапку.
    filter_block — индекс таблицы, на которую ставится автофильтр."""
    ws = wb.create_sheet(name)
    header_lines = header_lines or []

    # раскладка заранее: в потоковом режиме ширины/закрепление/фильтр задаются до записи строк
    layout = []
    r = len(header_lines) + (1 if header_lines else 0)
    for b in blocks:
        title_row = r + 1 if b.title else None
        head = r + (2 if b.title else 1)
        last = head + len(b.rows)
        total = last + 1 if (b.total_cols and b.rows) else None
        layout.append((title_row, head, last, total))
        r = (total or last) + 1

    for col, width in _widths(blocks).items():
        ws.column_dimensions[get_column_letter(col)].width = width
    if freeze and layout:
        ws.freeze_panes = f"{freeze}{layout[0][1] + 1}"
    if filter_block is not None and blocks[filter_block].rows:
        _, head, last, _ = layout[filter_block]
        ws.auto_filter.ref = f"A{head}:{get_column_letter(len(blocks[filter_block].headers))}{last}"

    for text, font, fill in header_lines:
        ws.append([_cell(ws, text, font=font, fill=fill)])
    if header_lines:
        ws.append([])

    for b, (title_row, head, last, total) in zip(blocks, layout):
        if b.title:
            ws.append([_cell(ws, b.title, font=_TITLE_FONT)])
        ws.append([_cell(ws, h, font=_HEAD_FONT, fill=_HEAD_FILL, align=_HEAD_ALIGN) for h in b.headers])
        for row in b.rows:
            ws.append([_cell(ws, v, b.num_cols.get(i)) for i, v in enumerate(row, 1)])
        if total:
            cells = []
            for i in range(1, len(b.headers) + 1):
                if i == 1:
                    cells.append(_cell(ws, "ИТОГО", font=_BOLD, fill=_TOTAL_FILL))
                elif i in b.total_cols:
                    col = get_column_letter(i)
                    c = WriteOnlyCell(ws, value=f"=SUM({col}{head + 1}:{col}{last})")
                    c.font, c.fill, c.number_format = _BOLD, _TOTAL_FILL, b.num_cols.get(i, NUM)
                    cells.append(c)
                else:
                    cells.append(_cell(ws, None, fill=_TOTAL_FILL))
            ws.append(cells)
        ws.append([])
    return ws


def _usd(b):
    return (b or {}).get("usd", 0) if b else 0


def build_workbook(report: dict, rates: dict, rates_month: str) -> bytes:
    cats = list(CATEGORIES)
    period = report["period"]
    p_label = f"{period['from']} — {period['to']}"
    cat_headers = [CATEGORIES[c] for c in cats] + ["Итого USD"]
    cat_nums = {i: NUM for i in range(2, len(cats) + 3)}
    cat_totals = list(range(2, len(cats) + 3))

    def cat_rows(src):
        return [[p["name"]] + [_usd(p.get(c)) for c in cats] + [_usd(p.get("total"))] for p in src]

    wb = openpyxl.Workbook(write_only=True)

    # 1. Итоги
    lines = [
        (f"ДОХОДЫ ЗА ПЕРИОД {p_label}", _BIG_FONT, None),
        (f"Курсы для пересчёта в USD: {rates_month}. Конвертации с USD — по курсу сделки.", None, None),
    ]
    if report["missing_rates"]:
        lines.append(("Нет курса для валют: " + ", ".join(report["missing_rates"])
                      + " — суммы в этих валютах не вошли в USD", None, _WARN_FILL))
    write_sheet(wb, "Итоги", [
        Block(["Вид дохода", "USD"], [[CATEGORIES[c], _usd(report["totals"].get(c))] for c in cats],
              {2: NUM}, [2], title="Итоги по видам дохода"),
        Block(["Провайдер"] + cat_headers, cat_rows(report["by_provider"]), cat_nums, cat_totals,
              title="Итоги по провайдерам"),
    ], header_lines=lines)

    # 2. Свод по профилям
    write_sheet(wb, "Свод по профилям", [
        Block(["Профиль"] + cat_headers, cat_rows(report["by_profile"]), cat_nums, cat_totals,
              title=f"Свод по профилям, USD · {p_label}"),
    ], freeze="B", filter_block=0)

    # 3. Сделки ЦБ (комиссии)
    write_sheet(wb, "Сделки ЦБ", [
        Block(["Профиль", "Счёт", "Валюта", "Сделок", "Комиссия клиента", "Комиссия провайдера",
               "Чистая комиссия", "Funding fee", "Итого в валюте", "Итого USD"],
              [[r["profile"], r["account"], r["currency"], r["trades"], r["client"], r["provider"], r["net"],
                r["funding"], r["total"], r["usd"]] for r in report["commission"]],
              {5: NUM6, 6: NUM6, 7: NUM6, 8: NUM6, 9: NUM6, 10: NUM}, [4, 10],
              title=f"Комиссионный доход (клиент − провайдер) + funding · {p_label}"),
    ], freeze="C", filter_block=0)

    # 4. Конвертация
    write_sheet(wb, "Конвертация", [
        Block(["Профиль", "Счёт", "Провайдер", "Trade ID", "Время", "Инструмент", "Сторона", "Объём (база)",
               "Курс клиента", "Курс провайдера", "Сумма клиента (котир.)", "Сумма провайдера (котир.)",
               "Доход (котир.)", "Валюта котир.", "Доход (база)", "Валюта база", "markupAmount Unity",
               "Чистая комиссия", "Доход USD", "Источник", "Сопоставление"],
              [[r["profile"], r["account"], r["provider"], r["trade_id"], r["transact_time"][:19], r["instrument"],
                r["side"], r["amount"], r["price"], r["provider_price"], r["client_quote_amount"],
                r["provider_quote_amount"], r["spread_quote"], r["quote_ccy"], r["spread_base"], r["base_ccy"],
                r["markup_amount"], r["net_commission"], r["usd"], r["source"], MATCH_LABEL.get(r["match"], r["match"])]
               for r in report["conversions"]],
              {8: NUM6, 9: NUM6, 10: NUM6, 11: NUM, 12: NUM, 13: NUM, 15: NUM, 17: NUM, 18: NUM, 19: NUM}, [19],
              title=f"Доход от конвертации (курс клиента vs курс провайдера) · {p_label}"),
    ], freeze="D", filter_block=0)

    # 5. Mark-up / 6. Крипта
    for key, title in (("markup", "Mark-up"), ("crypto", "Крипта")):
        write_sheet(wb, title, [
            Block(["Провайдер", "Счёт", "Профиль", "Тип", "Валюта", "Сумма в валюте", "USD"],
                  [[r["provider"], r["account"], r["profile"], SUB_LABEL.get(r["sub"], r["sub"]), r["currency"],
                    r["amount"], r["usd"]] for r in report[key]],
                  {6: NUM6, 7: NUM}, [7], title=f"{title} · {p_label}"),
        ], freeze="C", filter_block=0)

    # 7. По провайдерам
    write_sheet(wb, "По провайдерам", [
        Block(["Провайдер"] + cat_headers, cat_rows(report["by_provider"]), cat_nums, cat_totals,
              title=f"Доход по провайдерам, USD · {p_label}"),
    ])

    # 8. Курсы
    write_sheet(wb, "Курсы", [
        Block(["Пара", "Валюта", "Курс"], [[pair_label(c, r["mode"]), c, r["rate"]] for c, r in sorted(rates.items())],
              {3: NUM6}, title=f"Курсы на {rates_month}"),
    ])

    # 9. Детализация сделок (может быть десятки тысяч строк)
    write_sheet(wb, "Сделки (детали)", [
        Block(["Дата", "Время", "Trade ID", "Профиль", "Счёт", "Провайдер", "Вид", "Инструмент", "Сторона",
               "Объём", "Цена", "Валюта", "Комиссия клиента", "Комиссия провайдера", "Чистая комиссия",
               "markupAmount", "Сопоставление", "Сделки провайдера", "Цена провайдера"],
              [[r["trade_date"], r["transact_time"][:19], r["trade_id"], r["profile"], r["account"], r["provider"],
                KIND_LABEL.get(r["kind"], r["kind"]), r["instrument"], r["side"], r["amount"], r["price"],
                r["quote_ccy"], r["client_commission"], r["provider_commission"], r["net_commission"],
                r["markup_amount"], MATCH_LABEL.get(r["match"], r["match"]), r["provider_trade_ids"],
                r["provider_price"]] for r in report["trades"]],
              {10: NUM6, 11: NUM6, 13: NUM6, 14: NUM6, 15: NUM6, 16: NUM6, 19: NUM6}),
    ], freeze="D", filter_block=0)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
