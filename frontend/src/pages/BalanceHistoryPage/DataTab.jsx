import React, { useState } from "react";
import { toast } from "react-toastify";
import { Download, Loader2, Search } from "lucide-react";
import { PeriodStrip } from "./ui";
import { T, S, fmt } from "./helpers";
import { fetchData, exportExcel } from "./api";

const FIELDS = [
  ["totalAssets",      "Total Assets"],
  ["cashBalance",      "Cash Balance"],
  ["portfolioValue",   "Portfolio Value"],
  ["blocked",          "Blocked"],
  ["marginBalance",    "Margin Balance"],
  ["marginAvailable",  "Margin Available"],
  ["marginUsage",      "Margin Usage"],
  ["dailyPnl",         "Daily PnL"],
  ["dailyPnlPercent",  "Daily PnL %"],
];

const T_blue = "#3b82f6";

export default function DataTab({ accounts }) {
  const [mode,      setMode]      = useState("single"); // "single" | "range"
  const [date,      setDate]      = useState("");
  const [from,      setFrom]      = useState("");
  const [to,        setTo]        = useState("");
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fetched,   setFetched]   = useState(false);

  const fromDate = mode === "single" ? date : from;
  const toDate   = mode === "single" ? date : to;

  const handleLoad = async () => {
    if (accounts.length === 0) { toast.warn("Сначала добавьте счета во вкладке «Счета»"); return; }
    if (!fromDate || !toDate)  { toast.warn("Укажите дату"); return; }
    setLoading(true);
    try {
      const { data } = await fetchData(fromDate, toDate);
      setRows(data || []);
      setFetched(true);
      if (!data?.length) toast.info("Данные за выбранный период не найдены");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка загрузки");
    } finally { setLoading(false); }
  };

  const handleExport = async () => {
    if (!fromDate || !toDate) { toast.warn("Укажите дату"); return; }
    setExporting(true);
    try {
      const res = await exportExcel(fromDate, toDate);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", `balances_${fromDate}_${toDate}.xlsx`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка экспорта");
    } finally { setExporting(false); }
  };

  const pnlColor = (v) => {
    if (v == null) return T.ink;
    return Number(v) >= 0 ? T.green : T.red;
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>

        {/* Переключатель режима */}
        <div style={{ display: "flex", gap: 2, marginBottom: 16, background: T.bg, borderRadius: 8, padding: 3, width: "fit-content", border: `1px solid ${T.border}` }}>
          {[["single", "Одна дата"], ["range", "Период"]].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setRows([]); setFetched(false); }}
              style={{
                padding: "6px 16px", border: "none", borderRadius: 6, cursor: "pointer",
                fontSize: 12, fontWeight: mode === m ? 600 : 400,
                background: mode === m ? "#fff" : "transparent",
                color: mode === m ? T_blue : T.muted,
                boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}
            >{label}</button>
          ))}
        </div>

        {/* Пресеты только в режиме периода */}
        {mode === "range" && (
          <PeriodStrip onSelect={(s, e) => { setFrom(s); setTo(e); }} />
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          {mode === "single" ? (
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Дата</label>
              <input className="text-input" type="date" value={date}
                onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
            </div>
          ) : (
            <>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">С</label>
                <input className="text-input" type="date" value={from}
                  onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">По</label>
                <input className="text-input" type="date" value={to}
                  onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
              </div>
            </>
          )}

          <button className="btn" onClick={handleLoad} disabled={loading}>
            {loading
              ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
              : <Search size={14} style={{ marginRight: 6 }} />}
            Загрузить
          </button>

          {fetched && (
            <button style={S.ghost} onClick={handleExport} disabled={exporting}>
              {exporting
                ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
                : <Download size={14} style={{ marginRight: 6 }} />}
              Экспорт Excel
            </button>
          )}
        </div>
      </div>

      {fetched && rows.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
            Найдено записей: <b>{rows.length}</b> · {mode === "single" ? fromDate : `${fromDate} — ${toDate}`}
          </div>
          <div className="result-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="styled-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Счёт</th>
                  <th>Дата</th>
                  {FIELDS.map(([, label]) => (
                    <th key={label} style={{ textAlign: "right" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const b = row.balance || {};
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>{row.account_name}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.date}</td>
                      {FIELDS.map(([key]) => (
                        <td key={key} style={{
                          textAlign: "right", fontSize: 13,
                          color: key.includes("Pnl") ? pnlColor(b[key]) : T.ink,
                          fontWeight: key === "totalAssets" ? 600 : 400,
                        }}>
                          {key === "dailyPnlPercent"
                            ? (b[key] != null ? `${fmt(b[key], 2)}%` : "—")
                            : fmt(b[key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fetched && rows.length === 0 && !loading && (
        <div style={S.empty}>
          <p style={{ color: T.faint, margin: 0 }}>Нет данных за выбранный период.</p>
        </div>
      )}
    </div>
  );
}
