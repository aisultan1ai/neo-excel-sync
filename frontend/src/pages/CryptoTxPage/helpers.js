// Разделы приходят с сервера: {id, name, direction: "in"|"out", counterparty_label, archived, tx_count}
export const whoLabel = (s) => s?.counterparty_label || (s?.direction === "out" ? "Куда" : "Откуда");
export const DIR_LABEL = { in: "Пополнение", out: "Вывод" };

export const T = {
  ink: "#1e293b", muted: "#64748b", faint: "#94a3b8", border: "#e2e8f0", bg: "#f8fafc",
  blue: "#2563eb", green: "#15803d", red: "#b91c1c",
  label: { fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" },
  small: { fontSize: 12, color: "#64748b" },
};

export const S = {
  ghost: { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6 },
  th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${T.border}`, background: T.bg, position: "sticky", top: 0, whiteSpace: "nowrap", zIndex: 1 },
  td: { padding: "7px 10px", fontSize: 13, color: T.ink, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" },
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  empty: { textAlign: "center", padding: "28px 20px", background: T.bg, borderRadius: 8, border: `1px dashed ${T.border}` },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: T.muted, display: "inline-flex", alignItems: "center" },
};

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const PRESETS = [
  ["Всё время", () => ({ from: "", to: "" })],
  ["Текущий месяц", () => { const d = new Date(); return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(d) }; }],
  ["Прошлый месяц", () => { const d = new Date(); return { from: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: iso(new Date(d.getFullYear(), d.getMonth(), 0)) }; }],
  ["Текущий год", () => { const d = new Date(); return { from: `${d.getFullYear()}-01-01`, to: iso(d) }; }],
];

// "2026-07-15T08:37:00" → "15.07.2026 08:37"
export const fmtDT = (s) => {
  if (!s) return "—";
  const [d, t = ""] = String(s).replace(" ", "T").split("T");
  const [y, m, day] = d.split("-");
  const hm = t.slice(0, 5);
  return `${day}.${m}.${y}${hm && hm !== "00:00" ? ` ${hm}` : ""}`;
};

// для <input type="datetime-local">
export const toInputDT = (s) => (s ? String(s).replace(" ", "T").slice(0, 16) : "");
export const nowInputDT = () => { const d = new Date(); return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export const fmtAmount = (n) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 8 });

export const shortHash = (h) => (!h ? "—" : h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);

export const errText = (err, fallback) => {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => String(x.msg || "").replace(/^Value error, /, "")).join("; ");
  return fallback;
};

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
