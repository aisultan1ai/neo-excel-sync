export const fmt = (n, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

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

export const PERIOD_PRESETS = [
  { label: "Сегодня",        start: todayStr,              end: todayStr },
  { label: "7 дней",         start: () => daysAgo(6),      end: todayStr },
  { label: "Этот месяц",     start: () => monthStart(0),   end: todayStr },
  { label: "Прошлый месяц",  start: () => monthStart(-1),  end: () => monthEnd(-1) },
  { label: "3 месяца",       start: () => daysAgo(89),     end: todayStr },
];

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

export const S = {
  ghost:    { background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: T.muted },
  iconBtn:  { background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: T.muted, display: "flex", alignItems: "center" },
  eyeBtn:   { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 2 },
  empty:    { textAlign: "center", padding: "28px 20px", background: T.bg, borderRadius: 8, border: `1px dashed ${T.border}` },
};
