import React, { useState } from "react";
import { FileSpreadsheet, UploadCloud, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";

export const pageStyles = `
  .fade-in { animation: fadeIn 0.3s ease-in-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .hover-card { transition: all 0.2s ease; }
  .hover-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); }
  .custom-btn { transition: all 0.2s; }
  .custom-btn:hover:not(:disabled) { filter: brightness(110%); transform: translateY(-1px); }
  .custom-btn:active:not(:disabled) { transform: translateY(0); }
  .drop-zone { transition: all 0.2s; border: 2px dashed #cbd5e1; background: #f8fafc; }
  .drop-zone.active { border-color: #3b82f6; background: #eff6ff; }
  .drop-zone:hover { border-color: #94a3b8; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

export const SimpleFileBlock = ({ title, file, setFile, headers, setHeaders, selectedCol, setSelectedCol, color, showSelect = true, description }) => {
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (f) => {
    if (!f) return;
    setFile(f);
    if (showSelect && setHeaders) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length > 0) setHeaders(data[0]);
      };
      reader.readAsBinaryString(f);
    }
  };

  return (
    <div
      className="card hover-card"
      style={{ flex: 1, minWidth: "320px", borderTop: `4px solid ${color}`, background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
        <div style={{ background: color, padding: "10px", borderRadius: "10px", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#1e293b" }}>{title}</h3>
          {description && <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>{description}</p>}
        </div>
      </div>

      <div
        className={`drop-zone ${isDragging ? "active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); }}
        style={{ marginBottom: "15px", borderRadius: "12px", padding: "25px", textAlign: "center", position: "relative", cursor: "pointer" }}
      >
        <input
          type="file"
          onChange={(e) => processFile(e.target.files[0])}
          accept=".xlsx, .xls, .csv"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
        />
        {file ? (
          <div className="fade-in" style={{ color: "#16a34a", fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={32} />
            <span style={{ wordBreak: "break-all" }}>{file.name}</span>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>Нажмите, чтобы заменить</span>
          </div>
        ) : (
          <div style={{ color: isDragging ? "#3b82f6" : "#94a3b8", transition: "color 0.2s" }}>
            <UploadCloud size={32} style={{ marginBottom: "8px" }} />
            <div style={{ fontWeight: 500, fontSize: "14px" }}>{isDragging ? "Отпустите файл здесь" : "Перетащите файл сюда"}</div>
            <div style={{ fontSize: "12px", opacity: 0.7 }}>или нажмите для выбора</div>
          </div>
        )}
      </div>

      {showSelect && (
        <div className="fade-in">
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px", display: "block" }}>
            🎯 Колонка поиска (Инструмент)
          </label>
          <select
            value={selectedCol}
            onChange={(e) => setSelectedCol(e.target.value)}
            disabled={!headers.length}
            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", background: headers.length ? "white" : "#f1f5f9", color: "#1e293b", fontSize: "14px", outline: "none", cursor: "pointer" }}
          >
            <option value="">{headers.length ? "-- Выберите колонку --" : "Сначала загрузите файл"}</option>
            {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
          </select>
        </div>
      )}
    </div>
  );
};

export const TabButton = ({ active, onClick, color, label, count }) => (
  <button
    onClick={onClick}
    style={{
      padding: "16px 10px", border: "none", background: "transparent",
      borderBottom: active ? `3px solid ${color}` : "3px solid transparent",
      fontWeight: active ? 700 : 500, color: active ? color : "#64748b",
      cursor: "pointer", flex: 1, textAlign: "center", transition: "all 0.2s", fontSize: "14px",
    }}
  >
    {label}
    <span style={{ marginLeft: 8, background: active ? color : "#e2e8f0", color: active ? "white" : "#64748b", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", verticalAlign: "middle" }}>
      {count}
    </span>
  </button>
);

export const NavButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    className="custom-btn"
    onClick={onClick}
    style={{
      padding: "8px 16px", border: "none", borderRadius: "8px", cursor: "pointer",
      fontWeight: 600, fontSize: "14px",
      background: active ? "white" : "transparent",
      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
      color: active ? "#0f172a" : "#64748b",
      display: "flex", alignItems: "center", gap: "8px", transition: "all 0.2s",
    }}
  >
    <Icon size={16} />{label}
  </button>
);
