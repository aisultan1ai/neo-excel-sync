import React from "react";
import { FileText } from "lucide-react";
import { podftRowKey } from "./helpers";

const ResultTable = ({ data, activeTab, filterText, filterCol, podftSelectMode, podftSelected, setPodftSelected }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "12px" }}>
        <FileText size={64} style={{ opacity: 0.3, marginBottom: "20px" }} />
        <p style={{ fontSize: "18px", fontWeight: 500 }}>В этой категории данных нет</p>
      </div>
    );
  }

  const headers = Object.keys(data[0] || {});
  const normalizedQuery = (filterText || "").trim().toLowerCase();

  const filtered = !normalizedQuery
    ? data
    : data.filter((row) => {
        if (filterCol) return String(row?.[filterCol] ?? "").toLowerCase().includes(normalizedQuery);
        return headers.some((h) => String(row?.[h] ?? "").toLowerCase().includes(normalizedQuery));
      });

  const isPodftTab = activeTab === "podft_7m_deals";

  const toggleRow = (row) => {
    const key = podftRowKey(row);
    setPodftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllFiltered = (checked) => {
    if (!isPodftTab) return;
    setPodftSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((r) => (checked ? next.add(podftRowKey(r)) : next.delete(podftRowKey(r))));
      return next;
    });
  };

  const allChecked =
    isPodftTab &&
    podftSelectMode &&
    filtered.length > 0 &&
    filtered.every((r) => podftSelected.has(podftRowKey(r)));

  return (
    <div className="result-table-wrapper" style={{ height: "100%", overflow: "auto", border: "none" }}>
      <table className="styled-table">
        <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
          <tr>
            {isPodftTab && podftSelectMode && (
              <th style={{ width: 46, textAlign: "center" }}>
                <input type="checkbox" checked={!!allChecked} onChange={(e) => toggleAllFiltered(e.target.checked)} title="Выбрать все (по текущему фильтру)" />
              </th>
            )}
            {headers.map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 2000).map((row, i) => {
            const key = isPodftTab ? podftRowKey(row) : String(i);
            const checked = isPodftTab && podftSelected.has(key);
            return (
              <tr key={key} style={{ background: checked ? "#fff7ed" : undefined }}>
                {isPodftTab && podftSelectMode && (
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleRow(row)} />
                  </td>
                )}
                {headers.map((h) => <td key={`${key}_${h}`}>{String(row?.[h] === null ? "" : row?.[h] ?? "")}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length > 2000 && (
        <div style={{ padding: "10px", fontSize: 12, color: "#64748b" }}>
          Показаны первые 2000 строк из {filtered.length}. Уточните фильтр.
        </div>
      )}
    </div>
  );
};

export default ResultTable;
