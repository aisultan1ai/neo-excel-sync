// Local date as YYYY-MM-DD (timezone-safe, no UTC shift)
export const getLocalYMD = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Short date from ISO string → "DD.MM.YYYY" or locale default
export const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
};

// HH:MM from any date-like value
export const fmtTime = (v) => {
  if (!v) return "";
  try {
    return new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

// Number with up to 8 decimal places, locale-formatted
export const fmtAmount = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });
};

// Datetime string → Almaty timezone, "DD.MM.YYYY HH:MM:SS"
export const fmtDT = (v) => {
  if (!v) return "—";
  const s = String(v).replace(" ", "T");
  const norm = /[Zz]|[+\-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z";
  const d = new Date(norm);
  if (isNaN(d.getTime())) return s.slice(0, 19).replace("T", " ");
  return d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", hour12: false }).replace(",", "");
};

// YYYY-MM-DD from Date
export const iso = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const todayStr = () => iso(new Date());

export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
