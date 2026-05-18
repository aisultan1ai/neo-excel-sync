// ─── formatters ──────────────────────────────────────────────────────────────

export const fmt = (n, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt8 = (n) => fmt(n, 8);

export const fmtDate = (v) => (!v ? "-" : String(v).slice(0, 10));

export const fmtDT = (v, tzOffset = 0) => {
  if (!v) return "-";
  const s = String(v).replace(" ", "T");
  const norm = /[Zz]|[-+]\d{2}:?\d{2}$/.test(s) ? s : s + "Z";
  const d = new Date(norm);
  if (isNaN(d.getTime())) return s.slice(0, 19).replace("T", " ");
  return new Date(d.getTime() + tzOffset * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
};

// ─── date helpers ─────────────────────────────────────────────────────────────

export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayStr = () => iso(new Date());

export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

export const monthStart = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return iso(d);
};

export const monthEnd = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  return iso(d);
};

// ─── constants ────────────────────────────────────────────────────────────────

export const PERIOD_PRESETS = [
  { label: "7 дней",        start: () => daysAgo(6),     end: todayStr },
  { label: "Этот месяц",    start: () => monthStart(0),  end: todayStr },
  { label: "Прошлый месяц", start: () => monthStart(-1), end: () => monthEnd(-1) },
  { label: "3 месяца",      start: () => daysAgo(89),    end: todayStr },
  { label: "6 месяцев",     start: () => daysAgo(179),   end: todayStr },
];

export const WEEKDAYS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// ─── design tokens ────────────────────────────────────────────────────────────

export const T = {
  ink:    "#1e293b",
  muted:  "#64748b",
  faint:  "#94a3b8",
  border: "#e2e8f0",
  bg:     "#f8fafc",
  blue:   "#2563eb",
  green:  "#16a34a",
  red:    "#dc2626",
  label:  { fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" },
  body:   { fontSize: 13, color: "#334155" },
  small:  { fontSize: 12, color: "#64748b" },
};

// ─── style constants ──────────────────────────────────────────────────────────

export const S = {
  ghost:    { background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: T.muted },
  dangerBtn:{ background: "transparent", border: "1px solid #fca5a5", borderRadius: 8, padding: "9px 18px", color: "#ef4444", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", cursor: "pointer" },
  iconBtn:  { background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: T.muted, display: "flex", alignItems: "center" },
  eyeBtn:   { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 2 },
  chev:     { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: T.faint },
  empty:    { textAlign: "center", padding: "28px 20px", background: T.bg, borderRadius: 8, border: `1px dashed ${T.border}` },
};
