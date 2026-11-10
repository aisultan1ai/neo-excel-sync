"""Excel-выгрузка отчёта «Доходы» (структура как у ручного отчёта)."""
from __future__ import annotations

import io

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .rules import CATEGORIES, pair_label

_HEAD_FILL = PatternFill("solid", fgColor="1F4E79")
_HEAD_FONT = Font(bold=True, color="FFFFFF", size=10)
_TOTAL_FILL = PatternFill("solid", fgColor="DDEBF7")
_WARN_FILL = PatternFill("solid", fgColor="FFF2CC")
_THIN = Side(style="thin", color="D9E1EA")
_BORDER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)
NUM = "#,##0.00"
NUM6 = "#,##0.######"

MATCH_LABEL = {"execution": "Execution ID", "order": "Ордер провайдера", "auto": "Авто (время/объём)", "none": "Нет пары"}
KIND_LABEL = {"other": "Сделки", "conversion": "Конвертация", "crypto": "Крипта"}
SUB_LABEL = {"trades": "Сделки", "funding": "Funding fee", "markup": "Mark-up", "commission": "Комиссия",
             "spread": "Курсовая разница"}


def _table(ws, top: int, headers: list, rows: list, num_cols: dict | None = None, total_cols: list | None = None,
           title: str | None = None) -> int:
    """Пишет таблицу, возвращает следующую свободную строку."""
    num_cols = num_cols or {}
    r = top
    if title:
        ws.cell(row=r, column=1, value=title).font = Font(bold=True, size=12, color="1F4E79")
        r += 1
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=r, column=c, value=h)
        cell.fill, cell.font, cell.border = _HEAD_FILL, _HEAD_FONT, _BORDER
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    head = r
    for row in rows:
        r += 1
        for c, v in enumerate(row, 1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.border = _BORDER
            if c in num_cols and isinstance(v, (int, float)):
                cell.number_format = num_cols[c]
    if total_cols and rows:
        r += 1
        ws.cell(row=r, column=1, value="ИТОГО").font = Font(bold=True)
        for c in range(1, len(headers) + 1):
            ws.cell(row=r, column=c).fill = _TOTAL_FILL
            ws.cell(row=r, column=c).border = _BORDER
        for c in total_cols:
            col = get_column_letter(c)
            cell = ws.cell(row=r, column=c, value=f"=SUM({col}{head + 1}:{col}{r - 1})")
            cell.font, cell.number_format = Font(bold=True), num_cols.get(c, NUM)
    return r + 2


def _widths(ws, min_w=10, max_w=45):
    for col in ws.columns:
        length = max((len(str(c.value)) for c in col if c.value is not None and not str(c.value).startswith("=")), default=0)
        ws.column_dimensions[get_column_letter(col[0].column)].width = max(min_w, min(length + 2, max_w))


def _usd(b):
    return (b or {}).get("usd", 0) if b else 0


def build_workbook(report: dict, rates: dict, rates_month: str) -> bytes:
    cats = list(CATEGORIES)
    period = report["period"]
    p_label = f"{period['from']} — {period['to']}"
    wb = openpyxl.Workbook()

    # 1. Итоги
    ws = wb.active
    ws.title = "Итоги"
    ws["A1"] = f"ДОХОДЫ ЗА ПЕРИОД {p_label}"
    ws["A1"].font = Font(bold=True, size=14, color="1F4E79")
    ws["A2"] = f"Курсы для пересчёта в USD: {rates_month}. Конвертации с USD — по курсу сделки."
    nxt = 4
    if report["missing_rates"]:
        ws.cell(row=3, column=1, value="Нет курса для валют: " + ", ".join(report["missing_rates"])
                + " — суммы в этих валютах не вошли в USD").fill = _WARN_FILL
        nxt = 5
    rows = [[CATEGORIES[c], _usd(report["totals"].get(c))] for c in cats]
    nxt = _table(ws, nxt, ["Вид дохода", "USD"], rows, {2: NUM}, [2], title="Итоги по видам дохода")
    prov_rows = [[p["name"]] + [_usd(p.get(c)) for c in cats] + [_usd(p.get("total"))] for p in report["by_provider"]]
    _table(ws, nxt, ["Провайдер"] + [CATEGORIES[c] for c in cats] + ["Итого USD"], prov_rows,
           {i: NUM for i in range(2, len(cats) + 3)}, list(range(2, len(cats) + 3)), title="Итоги по провайдерам")
    _widths(ws)

    # 2. Свод по профилям
    ws = wb.create_sheet("Свод по профилям")
    rows = [[p["name"]] + [_usd(p.get(c)) for c in cats] + [_usd(p.get("total"))] for p in report["by_profile"]]
    _table(ws, 1, ["Профиль"] + [CATEGORIES[c] for c in cats] + ["Итого USD"], rows,
           {i: NUM for i in range(2, len(cats) + 3)}, list(range(2, len(cats) + 3)), title=f"Свод по профилям, USD · {p_label}")
    ws.freeze_panes = "B3"
    _widths(ws)

    # 3. Сделки ЦБ (комиссии)
    ws = wb.create_sheet("Сделки ЦБ")
    rows = [[r["profile"], r["account"], r["currency"], r["trades"], r["client"], r["provider"], r["net"],
             r["funding"], r["total"], r["usd"]] for r in report["commission"]]
    _table(ws, 1, ["Профиль", "Счёт", "Валюта", "Сделок", "Комиссия клиента", "Комиссия провайдера",
                   "Чистая комиссия", "Funding fee", "Итого в валюте", "Итого USD"], rows,
           {5: NUM6, 6: NUM6, 7: NUM6, 8: NUM6, 9: NUM6, 10: NUM}, [10],
           title=f"Комиссионный доход (клиент − провайдер) + funding · {p_label}")
    ws.freeze_panes = "C3"
    ws.auto_filter.ref = f"A2:J{ws.max_row}"
    _widths(ws)

    # 4. Конвертация
    ws = wb.create_sheet("Конвертация")
    rows = [[r["profile"], r["account"], r["provider"], r["trade_id"], r["transact_time"][:19], r["instrument"],
             r["side"], r["amount"], r["price"], r["provider_price"], r["client_quote_amount"], r["provider_quote_amount"],
             r["spread_quote"], r["quote_ccy"], r["spread_base"], r["base_ccy"], r["markup_amount"], r["net_commission"],
             r["usd"], r["source"], MATCH_LABEL.get(r["match"], r["match"])] for r in report["conversions"]]
    _table(ws, 1, ["Профиль", "Счёт", "Провайдер", "Trade ID", "Время", "Инструмент", "Сторона", "Объём (база)",
                   "Курс клиента", "Курс провайдера", "Сумма клиента (котир.)", "Сумма провайдера (котир.)",
                   "Доход (котир.)", "Валюта котир.", "Доход (база)", "Валюта база", "markupAmount Unity",
                   "Чистая комиссия", "Доход USD", "Источник", "Сопоставление"], rows,
           {8: NUM6, 9: NUM6, 10: NUM6, 11: NUM, 12: NUM, 13: NUM, 15: NUM, 17: NUM, 18: NUM, 19: NUM}, [19],
           title=f"Доход от конвертации (курс клиента vs курс провайдера) · {p_label}")
    ws.freeze_panes = "D3"
    ws.auto_filter.ref = f"A2:U{ws.max_row}"
    _widths(ws)

    # 5. Mark-up / 6. Крипта
    for key, title in (("markup", "Mark-up"), ("crypto", "Крипта")):
        ws = wb.create_sheet(title)
        rows = [[r["provider"], r["account"], r["profile"], SUB_LABEL.get(r["sub"], r["sub"]), r["currency"],
                 r["amount"], r["usd"]] for r in report[key]]
        _table(ws, 1, ["Провайдер", "Счёт", "Профиль", "Тип", "Валюта", "Сумма в валюте", "USD"], rows,
               {6: NUM6, 7: NUM}, [7], title=f"{title} · {p_label}")
        ws.freeze_panes = "C3"
        ws.auto_filter.ref = f"A2:G{ws.max_row}"
        _widths(ws)

    # 7. По провайдерам
    ws = wb.create_sheet("По провайдерам")
    _table(ws, 1, ["Провайдер"] + [CATEGORIES[c] for c in cats] + ["Итого USD"], prov_rows,
           {i: NUM for i in range(2, len(cats) + 3)}, list(range(2, len(cats) + 3)), title=f"Доход по провайдерам, USD · {p_label}")
    _widths(ws)

    # 8. Курсы
    ws = wb.create_sheet("Курсы")
    rows = [[pair_label(c, r["mode"]), c, r["rate"]] for c, r in sorted(rates.items())]
    _table(ws, 1, ["Пара", "Валюта", "Курс"], rows, {3: NUM6}, title=f"Курсы на {rates_month}")
    _widths(ws)

    # 9. Детализация сделок
    ws = wb.create_sheet("Сделки (детали)")
    rows = [[r["trade_date"], r["transact_time"][:19], r["trade_id"], r["profile"], r["account"], r["provider"],
             KIND_LABEL.get(r["kind"], r["kind"]), r["instrument"], r["side"], r["amount"], r["price"], r["quote_ccy"],
             r["client_commission"], r["provider_commission"], r["net_commission"], r["markup_amount"],
             MATCH_LABEL.get(r["match"], r["match"]), r["provider_trade_ids"], r["provider_price"]]
            for r in report["trades"]]
    _table(ws, 1, ["Дата", "Время", "Trade ID", "Профиль", "Счёт", "Провайдер", "Вид", "Инструмент", "Сторона",
                   "Объём", "Цена", "Валюта", "Комиссия клиента", "Комиссия провайдера", "Чистая комиссия",
                   "markupAmount", "Сопоставление", "Сделки провайдера", "Цена провайдера"], rows,
           {10: NUM6, 11: NUM6, 13: NUM6, 14: NUM6, 15: NUM6, 16: NUM6, 19: NUM6})
    ws.freeze_panes = "D2"
    ws.auto_filter.ref = f"A1:S{ws.max_row}"
    _widths(ws)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
