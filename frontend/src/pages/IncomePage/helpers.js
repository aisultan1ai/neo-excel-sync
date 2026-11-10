export const T = {
  ink:    "#1e293b",
  muted:  "#64748b",
  faint:  "#94a3b8",
  border: "#e2e8f0",
  bg:     "#f8fafc",
  blue:   "#2563eb",
  green:  "#16a34a",
  red:    "#dc2626",
  amber:  "#b45309",
  label:  { fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" },
  small:  { fontSize: 12, color: "#64748b" },
};

export const S = {
  ghost:   { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6 },
  empty:   { textAlign: "center", padding: "28px 20px", background: T.bg, borderRadius: 8, border: `1px dashed ${T.border}` },
  th:      { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${T.border}`, background: T.bg, position: "sticky", top: 0, whiteSpace: "nowrap" },
  td:      { padding: "7px 10px", fontSize: 13, color: T.ink, borderBottom: `1px solid ${T.border}`, verticalAlign: "top" },
  num:     { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  warn:    { padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e", display: "flex", gap: 8, alignItems: "center" },
};

export const CATEGORY_KEYS = ["commission", "conversion", "markup", "crypto"];
export const CATEGORY_LABELS = {
  commission: "Комиссионный доход",
  conversion: "Конвертация",
  markup: "Mark-up",
  crypto: "Крипта",
  total: "Итого",
};

export const MATCH_LABELS = {
  execution: "Execution ID",
  order: "Ордер провайдера",
  auto: "Авто",
  none: "Нет пары",
};

export const SUB_LABELS = {
  trades: "Сделки", funding: "Funding fee", markup: "Mark-up", commission: "Комиссия", spread: "Курсовая разница",
};

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const monthBounds = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${y}-${pad(m)}-01`, to: iso(new Date(y, m, 0)) };
};

export const prevMonthYM = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const monthOf = (dateStr) => (dateStr || "").slice(0, 7);

export const fmtUsd = (n) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtNum = (n, max = 6) =>
  n == null || n === "" ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: max });

export const fmtDate = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join(".") : "—");

export const fmtByCcy = (byCcy) =>
  Object.entries(byCcy || {}).map(([c, v]) => `${fmtNum(v, 2)} ${c}`).join(" · ");

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const errText = (err, fallback) => {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join("; ");
  return fallback;
};
