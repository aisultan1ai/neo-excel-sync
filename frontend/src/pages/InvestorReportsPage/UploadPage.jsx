import React, { useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  Upload,
  FileSpreadsheet,
  X,
  Download,
} from "lucide-react";

import { preview as apiPreview, templateUrl } from "./api";
import { PageTopBar, InvestorReportStyles } from "./ui";

const ACCEPTED = ".xls,.xlsx,.xlsm";

export default function UploadPage({ onPreview, onCancel }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState("consolidated");
  const [loading, setLoading] = useState(false);

  const handleFileChange = (picked) => {
    if (!picked) return;
    const ext = picked.name.split(".").pop().toLowerCase();
    if (!["xls", "xlsx", "xlsm"].includes(ext)) {
      toast.error("Допустимые форматы: .xls, .xlsx");
      return;
    }
    if (picked.size > 20 * 1024 * 1024) {
      toast.error("Файл слишком большой (максимум 20 МБ)");
      return;
    }
    setFile(picked);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileChange(e.dataTransfer.files[0]);
  };

  const clearFile = (e) => {
    e.stopPropagation();
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) { toast.error("Выберите файл"); return; }
    setLoading(true);
    try {
      const { data } = await apiPreview(file, mode, "B");
      onPreview(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Не удалось прочитать Excel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 50 }}>
      <InvestorReportStyles />

      <PageTopBar onBack={onCancel} backLabel="К истории" current="upload" />

      {/* Единая карточка со всем содержимым */}
      <div className="card" style={{ padding: 24 }}>
        {/* Header: mode tabs + template */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
            <TabBtn active={mode === "consolidated"} onClick={() => setMode("consolidated")}>
              Сводный файл
            </TabBtn>
            <TabBtn active={mode === "single"} onClick={() => setMode("single")}>
              По одному инвестору
            </TabBtn>
          </div>
          <a href={templateUrl(mode)}
             style={{
               display: "inline-flex", alignItems: "center", gap: 6,
               fontSize: 12, color: "#64748b", textDecoration: "none",
               padding: "6px 10px", borderRadius: 6,
             }}
             onMouseEnter={(e) => e.currentTarget.style.color = "#3b82f6"}
             onMouseLeave={(e) => e.currentTarget.style.color = "#64748b"}>
            <Download size={13} />
            Скачать шаблон
          </a>
        </div>

        {/* Drop zone — большая, чистая */}
        <div
          style={{
            border: `2px dashed ${dragOver ? "#3b82f6" : file ? "#10b981" : "#cbd5e1"}`,
            borderRadius: 12,
            padding: "48px 20px",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: dragOver ? "#eff6ff" : file ? "#f0fdf4" : "#fafbfc",
            transition: "all 0.15s ease",
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input ref={fileInputRef} type="file" accept={ACCEPTED} hidden
            onChange={(e) => handleFileChange(e.target.files[0])} />

          {!file ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ background: "#eff6ff", padding: 14, borderRadius: "50%" }}>
                <Upload size={26} color="#3b82f6" />
              </div>
              <div>
                <div style={{ fontSize: 15, color: "#1e293b", fontWeight: 600, marginBottom: 4 }}>
                  Перетащите Excel сюда
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  или <span style={{ color: "#3b82f6", fontWeight: 500 }}>выберите файл</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                XLS · XLSX · до 20 МБ
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <FileSpreadsheet size={36} color="#10b981" />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {(file.size / 1024).toFixed(1)} KB · {file.name.split(".").pop().toUpperCase()}
                </div>
              </div>
              <button type="button" onClick={clearFile}
                style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginLeft: 8 }}>
                <X size={14} color="#ef4444" />
              </button>
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onCancel} className="btn"
            style={{ background: "transparent", color: "#64748b", padding: "8px 18px", boxShadow: "none" }}>
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || loading}
            className="btn"
            style={{ padding: "8px 26px", opacity: !file || loading ? 0.5 : 1 }}
          >
            {loading ? "Читаем..." : "Далее →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TabBtn = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: "8px 16px",
      background: active ? "#fff" : "transparent",
      color: active ? "#1e293b" : "#64748b",
      border: "none",
      fontWeight: 600,
      fontSize: 13,
      cursor: "pointer",
      borderRadius: 6,
      transition: "all 0.15s ease",
      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
    }}
  >
    {children}
  </button>
);
