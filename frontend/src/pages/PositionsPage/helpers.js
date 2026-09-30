export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayStr = () => iso(new Date());

export const fmtQty = (n) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 });

export const fmtSigned = (n) => (n > 0 ? "+" : "") + fmtQty(n);

// Порядок = приоритет показа
export const STATUS = {
  MISSING:    { label: "Нет позиции",    bg: "#fee2e2", fg: "#b91c1c", hint: "По сделкам позиция должна быть, на счёте её нет" },
  MISMATCH:   { label: "Расхождение",    bg: "#ffedd5", fg: "#c2410c", hint: "Позиция есть, но размер не совпадает с суммой сделок" },
  UNEXPECTED: { label: "Лишняя позиция", bg: "#fef9c3", fg: "#a16207", hint: "Позиция есть на счёте, но по DIRECT-сделкам её быть не должно" },
  OK:         { label: "Сходится",       bg: "#dcfce7", fg: "#15803d", hint: "Позиция совпадает с суммой сделок" },
};

export const isIssue = (r) => r.status !== "OK";

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
  small:  { fontSize: 12, color: "#64748b" },
};

export const S = {
  ghost:   { background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: T.muted, display: "inline-flex", alignItems: "center" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: T.muted, display: "flex", alignItems: "center" },
  empty:   { textAlign: "center", padding: "28px 20px", background: T.bg, borderRadius: 8, border: `1px dashed ${T.border}` },
};
