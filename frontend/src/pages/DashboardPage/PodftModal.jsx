import React, { useMemo, useState } from "react";
import { CheckCircle, RefreshCw, Loader2, X, Search } from "lucide-react";

const PodftModal = ({ podft, podftTrades, podftLoading, podftUpdatedAt, onClose, onRefresh, getLocalYMD }) => {
  const [podftFilter, setPodftFilter] = useState("");

  const normalizedTrades = useMemo(() => {
    return (podftTrades || []).map((t) => {
      const raw = t?.raw;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...raw, ...t };
      return t;
    });
  }, [podftTrades]);

  const columns = useMemo(() => {
    if (normalizedTrades.length === 0) return [];
    const keys = new Set();
    normalizedTrades.slice(0, 1000).forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));
    const preferred = ["account", "instrument", "side", "trading_dt", "deal_dt", "value_date", "qty", "amount_tg", "created_at", "id"];
    const rest = [...keys].filter((k) => !preferred.includes(k)).sort((a, b) => a.localeCompare(b, "ru"));
    return [...preferred.filter((k) => keys.has(k)), ...rest];
  }, [normalizedTrades]);

  const filtered = useMemo(() => {
    const q = (podftFilter || "").trim().toLowerCase();
    if (!q) return normalizedTrades;
    return normalizedTrades.filter((row) => {
      const cols = columns.length ? columns : Object.keys(row || {});
      return cols.some((k) => String(row?.[k] ?? "").toLowerCase().includes(q));
    });
  }, [podftFilter, normalizedTrades, columns]);

  const formatTime = (d) => {
    if (!d) return "";
    try { return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
  };

  const subtleBtn = {
    background: "white", border: "1px solid #e2e8f0", borderRadius: "10px",
    padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", color: "#334155",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "18px" }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(860px, 96vw)", background: "white", borderRadius: "16px", boxShadow: "0 25px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle size={16} color="#10b981" />
            ПОД/ФТ сделки за {podft?.date || getLocalYMD()}
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#475569" }}>
              {podftTrades.length}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {podftUpdatedAt && (
              <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                обновлено {formatTime(podftUpdatedAt)}
              </span>
            )}
            <button type="button" onClick={() => onRefresh(podft?.date || getLocalYMD())} style={{ ...subtleBtn, opacity: podftLoading ? 0.7 : 1 }} disabled={podftLoading}>
              {podftLoading ? <Loader2 size={16} className="spin-anim" /> : <RefreshCw size={16} />}
              <span style={{ fontSize: 12, fontWeight: 600 }}>{podftLoading ? "..." : "Refresh"}</span>
            </button>
            <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
              <X size={20} color="#334155" />
            </button>
          </div>
        </div>

        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b" }}>
              <Search size={16} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>ПОИСК</span>
            </div>
            <input
              value={podftFilter}
              onChange={(e) => setPodftFilter(e.target.value)}
              placeholder="Фильтр по всем колонкам..."
              style={{ flex: 1, padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", outline: "none", fontSize: 13, color: "#0f172a" }}
            />
          </div>

          {podftLoading ? (
            <div style={{ padding: "16px", color: "#94a3b8" }}>Загрузка сделок...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 }}>Сделок нет</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>(или фильтр слишком строгий)</div>
            </div>
          ) : (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ maxHeight: "60vh", overflow: "auto" }}>
                <table className="styled-table" style={{ width: "100%" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                    <tr>{columns.map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 2000).map((row, idx) => (
                      <tr key={idx}>
                        {columns.map((h) => <td key={h}>{String(row?.[h] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > 2000 && (
                <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>
                  Показаны первые 2000 строк из {filtered.length}. Уточните фильтр.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PodftModal;
