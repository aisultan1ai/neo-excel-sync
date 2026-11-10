"""Расчёт доходов за период. Чистые функции: на входе данные из БД, на выходе отчёт.

Логика:
  * Сделки клиентских счетов (роль client) дают доход; сделки счетов провайдеров
    (роль provider) нужны только для сопоставления.
  * Каждая сделка клиента сопоставляется со сделкой провайдера:
      1) по Execution ID (orderDetails → remoteExecutionId / remoteOrderId);
      2) иначе — тот же инструмент, сторона, объём и время в пределах окна.
  * Комиссия = комиссия клиента − комиссия провайдера (сопоставленной сделки).
  * Конвертация (CASH.*) = разница цены клиента и провайдера × объём, в валюте
    котировки и в базовой валюте по курсу самой сделки. Без пары у провайдера —
    по markupAmount из Unity (помечается).
  * Mark-up = markupAmount (валюта котировки) по прочим сделкам.
  * Крипта = чистая комиссия + markup по крипто-инструментам.
  * Фандинг (FUNDING_FEE) с клиентских счетов — в комиссионный доход.
  * Суммы хранятся в исходной валюте; USD считается по курсам, введённым вручную.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from .rules import (
    CATEGORIES, UNKNOWN_PROVIDER, USD,
    account_title, classify_instrument, effective_role, profile_of, to_usd,
)

EPS = 1e-9


def _f(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _ts(v):
    if isinstance(v, datetime):
        return v.timestamp()
    if isinstance(v, str) and v:
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


# ── Сопоставление клиент ↔ провайдер ─────────────────────────────────────────

def match_trades(client_trades: list, provider_trades: list, executions: dict, window_sec: float) -> dict:
    """{client_trade_id: {"trades": [provider trades], "method": "execution"|"order"|"auto"}}"""
    prov_by_id = {str(p["id"]): p for p in provider_trades}
    prov_by_order = defaultdict(list)
    for p in provider_trades:
        if p.get("order_id"):
            prov_by_order[str(p["order_id"])].append(p)

    used: set = set()
    result: dict = {}

    client_by_order = defaultdict(list)
    for c in client_trades:
        if c.get("order_id"):
            client_by_order[str(c["order_id"])].append(c)

    # 1) Execution ID
    for order_id, execs in executions.items():
        cts = [c for c in client_by_order.get(str(order_id), []) if c["id"] not in result]
        if not cts or not execs:
            continue
        for ex in execs:
            p = prov_by_id.get(str(ex.get("remote_execution_id") or ""))
            if not p or p["id"] in used:
                continue
            ct = next((c for c in cts if str(c["id"]) == str(ex.get("execution_id"))), None)
            if ct is None:
                free = [c for c in cts if c["id"] not in result]
                ct = free[0] if len(free) == 1 else next(
                    (c for c in free if abs(abs(_f(c["amount"])) - abs(_f(p["amount"]))) < EPS), None)
            if ct is None or ct["id"] in result:
                continue
            result[ct["id"]] = {"trades": [p], "method": "execution"}
            used.add(p["id"])

        # по remoteOrderId — все сделки ордера провайдера
        free = [c for c in cts if c["id"] not in result]
        if not free:
            continue
        remote_orders = {str(ex.get("remote_order_id")) for ex in execs if ex.get("remote_order_id")}
        pts = [p for ro in remote_orders for p in prov_by_order.get(ro, []) if p["id"] not in used]
        if not pts:
            continue
        if len(free) == 1:
            result[free[0]["id"]] = {"trades": pts, "method": "order"}
            used.update(p["id"] for p in pts)
        else:
            for c in free:
                p = next((p for p in pts if p["id"] not in used
                          and abs(abs(_f(c["amount"])) - abs(_f(p["amount"]))) < EPS), None)
                if p:
                    result[c["id"]] = {"trades": [p], "method": "order"}
                    used.add(p["id"])

    # 2) Авто: инструмент + сторона + объём + время
    index = defaultdict(list)
    for p in provider_trades:
        if p["id"] in used:
            continue
        key = (p["instrument_id"], p["side"], round(abs(_f(p["amount"])), 8))
        index[key].append(p)
    for c in sorted(client_trades, key=lambda t: _ts(t.get("transact_time")) or 0):
        if c["id"] in result:
            continue
        key = (c["instrument_id"], c["side"], round(abs(_f(c["amount"])), 8))
        cts = _ts(c.get("transact_time"))
        if cts is None:
            continue
        best, best_dt = None, None
        for p in index.get(key, []):
            if p["id"] in used:
                continue
            pts = _ts(p.get("transact_time"))
            if pts is None:
                continue
            dt = abs(pts - cts)
            if dt <= window_sec and (best_dt is None or dt < best_dt):
                best, best_dt = p, dt
        if best:
            result[c["id"]] = {"trades": [best], "method": "auto"}
            used.add(best["id"])
    return result


# ── Агрегация ────────────────────────────────────────────────────────────────

class _Bucket:
    """Сумма по валютам + USD (если курс есть для всех валют)."""
    __slots__ = ("by_ccy", "usd", "missing")

    def __init__(self):
        self.by_ccy = defaultdict(float)
        self.usd = 0.0
        self.missing = False

    def add(self, amount: float, ccy: str, usd: float | None):
        self.by_ccy[ccy or "?"] += amount
        if usd is None:
            self.missing = True
        else:
            self.usd += usd

    def out(self) -> dict:
        return {
            "usd": round(self.usd, 2),
            "by_ccy": {k: round(v, 6) for k, v in sorted(self.by_ccy.items()) if abs(v) > EPS},
            "missing_rate": self.missing,
        }


def compute_report(data: dict, settings: dict, rates: dict) -> dict:
    """data = {accounts, instruments, assets, trades, transactions, executions, period}"""
    accounts: dict = data["accounts"]
    instruments: dict = data["instruments"]
    assets: dict = data["assets"]
    window = float(settings.get("match_window_sec") or 0)

    def acc(aid):
        return accounts.get(aid) or accounts.get(int(aid)) if aid is not None else None

    def ccy(asset_id):
        return (assets.get(asset_id) or assets.get(str(asset_id)) or "?") if asset_id is not None else "?"

    def provider_label_of_account(aid):
        a = acc(aid)
        return (a or {}).get("provider_label") or None

    client_trades, provider_trades = [], []
    for t in data["trades"]:
        (provider_trades if effective_role(acc(t["account_id"])) == "provider" else client_trades).append(t)

    matches = match_trades(client_trades, provider_trades, data.get("executions") or {}, window)

    lines: list = []            # все строки дохода
    conversions: list = []      # детализация конвертаций
    trade_rows: list = []       # детализация сделок клиента (для проверки)
    missing_rates: set = set()
    stats = defaultdict(int)

    def push(category, sub, aid, provider, currency, amount, trade_id=None, usd=None, usd_known=False):
        if abs(amount) < EPS:
            return
        if not usd_known:
            usd = to_usd(amount, currency, rates)
        if usd is None:
            missing_rates.add(currency)
        a = acc(aid)
        lines.append({
            "category": category, "sub": sub, "account_id": aid,
            "account": account_title(a, aid), "profile": profile_of(a, aid),
            "provider": provider or UNKNOWN_PROVIDER, "currency": currency,
            "amount": amount, "usd": usd, "trade_id": trade_id,
        })

    for t in client_trades:
        instr = instruments.get(t["instrument_id"]) or {}
        kind = classify_instrument(instr, settings)
        base, quote = ccy(instr.get("base_asset_id")), ccy(instr.get("quote_asset_id"))
        m = matches.get(t["id"])
        ptrades = (m or {}).get("trades") or []
        method = (m or {}).get("method") or "none"
        stats[f"{kind}_{method}"] += 1
        stats[f"{kind}_total"] += 1

        provider = None
        if ptrades:
            provider = provider_label_of_account(ptrades[0]["account_id"]) or account_title(
                acc(ptrades[0]["account_id"]), ptrades[0]["account_id"])
        provider = provider or provider_label_of_account(t["account_id"]) or UNKNOWN_PROVIDER

        amount = abs(_f(t["amount"]))
        price = _f(t["price"])
        client_comm = abs(_f(t.get("commission")))
        prov_comm = sum(abs(_f(p.get("commission"))) for p in ptrades)
        net_comm = client_comm - prov_comm
        markup = _f(t.get("markup_amount"))

        prov_amount = sum(abs(_f(p["amount"])) for p in ptrades)
        prov_price = (sum(abs(_f(p["amount"])) * _f(p["price"]) for p in ptrades) / prov_amount) if prov_amount else None

        row = {
            "trade_id": t["id"], "account_id": t["account_id"], "account": account_title(acc(t["account_id"]), t["account_id"]),
            "profile": profile_of(acc(t["account_id"]), t["account_id"]), "provider": provider,
            "kind": kind, "instrument": instr.get("ticker") or instr.get("code") or str(t["instrument_id"]),
            "side": t["side"], "amount": amount, "price": price, "quote_ccy": quote,
            "client_commission": client_comm, "provider_commission": prov_comm, "net_commission": net_comm,
            "markup_amount": markup, "match": method,
            "provider_trade_ids": ",".join(str(p["id"]) for p in ptrades),
            "provider_price": prov_price, "trade_date": str(t.get("trade_date") or ""),
            "transact_time": str(t.get("transact_time") or ""),
        }
        trade_rows.append(row)

        if kind == "conversion":
            sign = 1 if t["side"] == "BUY" else -1
            if prov_price is not None and abs(prov_amount - amount) < max(EPS, amount * 1e-9):
                spread_quote = (price - prov_price) * amount * sign
                source = "провайдер"
            elif prov_price is not None:
                # объём у провайдера другой — считаем по объёму клиента
                spread_quote = (price - prov_price) * amount * sign
                source = "провайдер (объём ≠)"
            else:
                spread_quote = markup
                source = "markupAmount"
            spread_base = spread_quote / price if price else 0.0
            if quote == USD:
                usd = spread_quote
            elif base == USD:
                usd = spread_base          # по курсу самой сделки
            else:
                usd = to_usd(spread_quote, quote, rates)
            conversions.append({
                **row, "pair": f"{base}/{quote}", "base_ccy": base,
                "client_quote_amount": amount * price,
                "provider_quote_amount": (amount * prov_price) if prov_price is not None else None,
                "spread_quote": spread_quote, "spread_base": spread_base, "usd": usd, "source": source,
            })
            push("conversion", "spread", t["account_id"], provider, quote, spread_quote, t["id"], usd, usd_known=True)
            push("conversion", "commission", t["account_id"], provider, quote, net_comm, t["id"])
        elif kind == "crypto":
            push("crypto", "commission", t["account_id"], provider, quote, net_comm, t["id"])
            push("crypto", "markup", t["account_id"], provider, quote, markup, t["id"])
        else:
            push("commission", "trades", t["account_id"], provider, quote, net_comm, t["id"])
            push("markup", "markup", t["account_id"], provider, quote, markup, t["id"])

    # Фандинг: списали с клиента → доход; начислили клиенту → минус
    for x in data.get("transactions") or []:
        if x.get("type") != "FUNDING_FEE":
            continue
        amt = _f(x.get("amount"))
        debit, credit = x.get("debit_account_id"), x.get("credit_account_id")
        d_client = debit is not None and acc(debit) is not None and effective_role(acc(debit)) == "client"
        c_client = credit is not None and acc(credit) is not None and effective_role(acc(credit)) == "client"
        if d_client and not c_client:
            aid, income = debit, abs(amt)
        elif c_client and not d_client:
            aid, income = credit, -abs(amt)
        elif d_client:
            aid, income = debit, -amt
        else:
            continue
        stats["funding_rows"] += 1
        push("commission", "funding", aid, provider_label_of_account(aid), ccy(x.get("asset_id")), income)

    return _aggregate(lines, conversions, trade_rows, stats, missing_rates, data, rates)


def _aggregate(lines, conversions, trade_rows, stats, missing_rates, data, rates) -> dict:
    cats = list(CATEGORIES)

    def tree():
        return defaultdict(_Bucket)

    by_cat = tree()
    by_profile = defaultdict(tree)
    by_provider = defaultdict(tree)
    # детализация по виду: (profile, account, provider, sub) → bucket
    detail = {c: defaultdict(_Bucket) for c in cats}

    for ln in lines:
        c = ln["category"]
        by_cat[c].add(ln["amount"], ln["currency"], ln["usd"])
        by_cat["total"].add(ln["amount"], ln["currency"], ln["usd"])
        by_profile[ln["profile"]][c].add(ln["amount"], ln["currency"], ln["usd"])
        by_profile[ln["profile"]]["total"].add(ln["amount"], ln["currency"], ln["usd"])
        by_provider[ln["provider"]][c].add(ln["amount"], ln["currency"], ln["usd"])
        by_provider[ln["provider"]]["total"].add(ln["amount"], ln["currency"], ln["usd"])
        detail[c][(ln["profile"], ln["account"], ln["provider"], ln["sub"])].add(ln["amount"], ln["currency"], ln["usd"])

    def table(src):
        rows = []
        for name, b in src.items():
            rows.append({"name": name, **{k: b[k].out() for k in cats + ["total"] if k in b}})
        rows.sort(key=lambda r: -(r.get("total") or {}).get("usd", 0))
        return rows

    def detail_rows(c):
        rows = []
        for (profile, account, provider, sub), b in detail[c].items():
            for cur, amt in b.by_ccy.items():
                if abs(amt) < EPS:
                    continue
                u = to_usd(amt, cur, rates)
                rows.append({"profile": profile, "account": account, "provider": provider, "sub": sub,
                             "currency": cur, "amount": round(amt, 6),
                             "usd": None if u is None else round(u, 2)})
        rows.sort(key=lambda r: (r["profile"], r["account"], r["sub"], r["currency"]))
        return rows

    # Комиссии по профилю: клиент / провайдер / чистая / фандинг
    comm = defaultdict(lambda: defaultdict(float))
    for r in trade_rows:
        if r["kind"] != "other":
            continue
        k = (r["profile"], r["account"], r["quote_ccy"])
        comm[k]["client"] += r["client_commission"]
        comm[k]["provider"] += r["provider_commission"]
        comm[k]["net"] += r["net_commission"]
        comm[k]["trades"] += 1
    for ln in lines:
        if ln["category"] == "commission" and ln["sub"] == "funding":
            comm[(ln["profile"], ln["account"], ln["currency"])]["funding"] += ln["amount"]
    commission_rows = []
    for (profile, account, cur), v in sorted(comm.items()):
        total = v["net"] + v["funding"]
        commission_rows.append({
            "profile": profile, "account": account, "currency": cur, "trades": int(v["trades"]),
            "client": round(v["client"], 6), "provider": round(v["provider"], 6),
            "net": round(v["net"], 6), "funding": round(v["funding"], 6), "total": round(total, 6),
            "usd": None if to_usd(total, cur, rates) is None else round(to_usd(total, cur, rates), 2),
        })

    match_stats = {}
    for kind in ("other", "conversion", "crypto"):
        total = stats.get(f"{kind}_total", 0)
        match_stats[kind] = {
            "total": total,
            "execution": stats.get(f"{kind}_execution", 0) + stats.get(f"{kind}_order", 0),
            "auto": stats.get(f"{kind}_auto", 0),
            "none": stats.get(f"{kind}_none", 0),
        }

    return {
        "period": data.get("period"),
        "categories": CATEGORIES,
        "totals": {k: b.out() for k, b in by_cat.items()},
        "by_profile": table(by_profile),
        "by_provider": table(by_provider),
        "commission": commission_rows,
        "conversions": sorted(conversions, key=lambda r: r["transact_time"]),
        "markup": detail_rows("markup"),
        "crypto": detail_rows("crypto"),
        "trades": trade_rows,
        "missing_rates": sorted(c for c in missing_rates if c and c != "?"),
        "unknown_currency": "?" in missing_rates,
        "match_stats": match_stats,
        "funding_rows": stats.get("funding_rows", 0),
        "counts": {
            "client_trades": len(trade_rows),
            "provider_trades": len(data["trades"]) - len(trade_rows),
            "transactions": len(data.get("transactions") or []),
            "lines": len(lines),
        },
    }
