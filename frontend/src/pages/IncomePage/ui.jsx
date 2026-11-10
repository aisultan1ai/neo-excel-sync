import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { S, T } from "./helpers";

export const StatTile = ({ label, value, sub, color = T.ink, warn }) => (
  <div style={{ flex: "1 1 170px", padding: "12px 14px", background: "#fff", border: `1px solid ${warn ? "#fde68a" : T.border}`, borderRadius: 10 }}>
    <div style={T.label}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    {sub && <div style={{ ...T.small, marginTop: 2, fontSize: 11 }}>{sub}</div>}
  </div>
);

export const Tabs = ({ tabs, active, onChange, size = "md" }) => (
  <div style={{ display: "flex", gap: 2, background: T.bg, borderRadius: 8, padding: 3, border: `1px solid ${T.border}`, flexWrap: "wrap", width: "fit-content", marginBottom: size === "md" ? 16 : 12 }}>
    {tabs.map(([key, label, Icon]) => (
      <button key={key} onClick={() => onChange(key)}
        style={{
          padding: size === "md" ? "7px 16px" : "5px 12px", border: "none", borderRadius: 6, cursor: "pointer",
          fontSize: size === "md" ? 13 : 12, fontWeight: active === key ? 600 : 400,
          background: active === key ? "#fff" : "transparent",
          color: active === key ? T.blue : T.muted,
          boxShadow: active === key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
        {Icon && <Icon size={14} />}{label}
      </button>
    ))}
  </div>
);

export const SearchBox = ({ value, onChange, placeholder = "Поиск", width = 240 }) => (
  <div style={{ position: "relative" }}>
    <Search size={14} color={T.faint} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
    <input className="text-input" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} style={{ paddingLeft: 30, width }} />
  </div>
);

/**
 * Простая таблица: columns = [{key, label, num, render, total}], rows = [...]
 * total: true → сумма колонки в подвале.
 */
export const DataTable = ({ columns, rows, maxHeight = 520, search = true, empty = "Нет данных", limit = 1000 }) => {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(null);

  const filtered = useMemo(() => {
    let r = rows || [];
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((row) => columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(s)));
    }
    if (sort) {
      const { key, dir } = sort;
      r = [...r].sort((a, b) => {
        const x = a[key], y = b[key];
        if (typeof x === "number" || typeof y === "number") return ((x ?? -Infinity) - (y ?? -Infinity)) * dir;
        return String(x ?? "").localeCompare(String(y ?? ""), "ru") * dir;
      });
    }
    return r;
  }, [rows, q, sort, columns]);

  const totals = useMemo(() => {
    const t = {};
    columns.forEach((c) => {
      if (c.total) t[c.key] = filtered.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    });
    return t;
  }, [filtered, columns]);

  const hasTotals = columns.some((c) => c.total);

  return (
    <div>
      {search && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <SearchBox value={q} onChange={setQ} />
          <span style={T.small}>{filtered.length} строк{filtered.length > limit ? ` (показаны первые ${limit})` : ""}</span>
        </div>
      )}
      {!filtered.length ? (
        <div style={S.empty}><span style={{ color: T.faint, fontSize: 13 }}>{empty}</span></div>
      ) : (
        <div style={{ maxHeight, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ ...S.th, ...(c.num ? { textAlign: "right" } : {}), cursor: "pointer" }}
                    title={c.hint}
                    onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? -s.dir : (c.num ? -1 : 1) }))}>
                    {c.label}{sort?.key === c.key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ ...S.td, ...(c.num ? S.num : {}) }}>
                      {c.render ? c.render(r[c.key], r) : (r[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hasTotals && (
              <tfoot>
                <tr>
                  {columns.map((c, i) => (
                    <td key={c.key} style={{ ...S.td, ...(c.num ? S.num : {}), fontWeight: 700, background: "#eff6ff", position: "sticky", bottom: 0 }}>
                      {i === 0 ? "Итого" : c.total ? (c.render ? c.render(totals[c.key], {}) : totals[c.key]) : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};
