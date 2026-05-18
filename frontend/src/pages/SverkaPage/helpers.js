import * as XLSX from "xlsx";

export const getLocalYMD = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const parseDateToISO = (v) => {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();

  if (typeof v === "number" && Number.isFinite(v)) {
    const dt = XLSX.SSF.parse_date_code(v);
    if (!dt) return "";
    const mm = String(dt.m).padStart(2, "0");
    const dd = String(dt.d).padStart(2, "0");
    return `${dt.y}-${mm}-${dd}`;
  }

  if (typeof v === "string") {
    const s = v.trim();
    const match = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
      const dd = String(match[1]).padStart(2, "0");
      const mm = String(match[2]).padStart(2, "0");
      return `${match[3]}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return "";
};

export const podftRowKey = (r) => {
  const dt = parseDateToISO(r?.["Дата валютирования"] ?? r?.["value_date"] ?? r?.["Value date"]);
  const acct = String(r?.["Субсчет"] ?? r?.["Account"] ?? r?.["account"] ?? "").trim();
  const instr = String(r?.["Instrument"] ?? r?.["инструмент"] ?? r?.["instrument"] ?? "").trim();
  const amt = String(r?.["Сумма тг"] ?? r?.["amount_tg"] ?? r?.["Amount tg"] ?? "").trim();
  const side = String(r?.["Side"] ?? r?.["side"] ?? "").trim();
  return [dt, acct, instr, side, amt].join("|");
};

export const buildPodftPayloadTrade = (r) => {
  const value_date = parseDateToISO(
    r?.["Дата валютирования"] ?? r?.["value_date"] ?? r?.["Value date"]
  );

  const num = (x) => {
    if (x === null || x === undefined || x === "") return null;
    if (typeof x === "number") return x;
    const s = String(x).replace(/\s+/g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  return {
    account: (r?.["Субсчет"] ?? r?.["Account"] ?? r?.["account"] ?? null) || null,
    instrument: (r?.["Instrument"] ?? r?.["инструмент"] ?? r?.["instrument"] ?? null) || null,
    side: (r?.["Side"] ?? r?.["side"] ?? null) || null,
    trading_dt: (r?.["Trading date"] ?? r?.["trading_dt"] ?? null) || null,
    deal_dt: (r?.["Deal date"] ?? r?.["deal_dt"] ?? null) || null,
    value_date: value_date || null,
    qty: num(r?.["Qty"] ?? r?.["qty"] ?? null),
    amount_tg: num(r?.["Сумма тг"] ?? r?.["amount_tg"] ?? null),
    raw: r,
  };
};
