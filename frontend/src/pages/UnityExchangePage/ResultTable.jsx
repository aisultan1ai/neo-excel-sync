import React, { useState } from "react";
import { Search } from "lucide-react";

const ResultTable = ({ rows }) => {
  const [filterText, setFilterText] = useState("");
  const [filterCol, setFilterCol] = useState("");

  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: 50, textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: 12 }}>
        Нет данных
      </div>
    );
  }

  const headers = Object.keys(rows[0] || {});
  const q = (filterText || "").trim().toLowerCase();
  const filtered = !q
    ? rows
    : rows.filter((r) => {
        if (filterCol) return String(r?.[filterCol] ?? "").toLowerCase().includes(q);
        return headers.some((h) => String(r?.[h] ?? "").toLowerCase().includes(q));
      });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderBottom: "1px solid #e2e8f0" }}>
        <Search size={16} color="#64748b" />
        <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)} style={{ height: 36, borderRadius: 8, border: "1px solid #e2e8f0", padding: "0 10px", fontWeight: 400 }}>
          <option value="">Все колонки</option>
          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Поиск..." style={{ height: 36, borderRadius: 8, border: "1px solid #e2e8f0", padding: "0 10px", width: 320, fontWeight: 400 }} />
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
          Показано: {Math.min(filtered.length, 2000)} / {filtered.length}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
            <tr>
              {headers.map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e2e8f0", fontSize: 12, color: "#475569", whiteSpace: "nowrap", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 2000).map((row, i) => (
              <tr key={i}>
                {headers.map((h) => (
                  <td key={h} style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 12, fontWeight: 400 }}>
                    {String(row?.[h] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 2000 && (
          <div style={{ padding: 10, fontSize: 12, color: "#64748b" }}>Показаны первые 2000 строк. Уточните фильтр.</div>
        )}
      </div>
    </div>
  );
};

export default ResultTable;
