import React, { useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  X,
  FileText,
  Download,
} from "lucide-react";

import { preview as apiPreview, templateUrl } from "./api";
import { StepIndicator } from "./ui";

const ACCEPTED = ".xls,.xlsx,.xlsm";

export default function UploadPage({ onPreview, onCancel }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState("consolidated"); // consolidated | single
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
    if (!file) {
      toast.error("Выберите файл");
      return;
    }
    setLoading(true);
    try {
      // formula='B' по умолчанию — второй вариант убрали из UI
      const { data } = await apiPreview(file, mode, "B");
      onPreview(data);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Не удалось прочитать Excel";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 720, paddingRight: 20, paddingBottom: 50 }}>
      <button onClick={onCancel} style={backLinkStyle}>
        <ArrowLeft size={16} /> К истории
      </button>

      <StepIndicator current="upload" />

      <h1 style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
        <FileText size={26} color="#3b82f6" />
        Загрузка отчёта
      </h1>
      <p style={{ marginTop: 0, marginBottom: 20, color: "#64748b", fontSize: 13 }}>
        Excel фонда → превью → генерация .docx
      </p>

      {/* ── Единая карточка ── */}
      <div className="card" style={{ padding: 20 }}>
        {/* Режим (tabs) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
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
               fontSize: 13, color: "#3b82f6", textDecoration: "none",
               background: "#eff6ff", padding: "6px 12px", borderRadius: 6,
               border: "1px solid #dbeafe",
             }}>
            <Download size={14} />
            Скачать шаблон
          </a>
        </div>

        {/* Drop zone */}
        <div
          style={{
            border: `2px dashed ${dragOver ? "#3b82f6" : file ? "#10b981" : "#cbd5e1"}`,
            borderRadius: 10,
            padding: "24px 20px",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: dragOver ? "#eff6ff" : file ? "#f0fdf4" : "#f8fafc",
            transition: "all 0.15s ease",
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => handleFileChange(e.target.files[0])}
          />
          {!file ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ background: "#e0f2fe", padding: 10, borderRadius: "50%" }}>
                <Upload size={22} color="#3b82f6" />
              </div>
              <div>
                <span style={{ color: "#3b82f6", fontWeight: 600, fontSize: 14 }}>Выбрать файл</span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}> · или drag&drop</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                XLS · XLSX · до 20 МБ
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <FileSpreadsheet size={32} color="#10b981" />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {(file.size / 1024).toFixed(1)} KB · {file.name.split(".").pop().toUpperCase()}
                </div>
              </div>
              <button type="button" onClick={clearFile}
                style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={14} color="#ef4444" />
              </button>
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onCancel} className="btn"
            style={{ background: "#e2e8f0", color: "#334155", padding: "8px 18px" }}>
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || loading}
            className="btn"
            style={{ padding: "8px 24px", opacity: !file || loading ? 0.6 : 1 }}
          >
            {loading ? "Читаем..." : "Превью →"}
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
      background: active ? "#3b82f6" : "#fff",
      color: active ? "#fff" : "#64748b",
      border: "none",
      fontWeight: 600,
      fontSize: 13,
      cursor: "pointer",
      transition: "all 0.15s ease",
    }}
  >
    {children}
  </button>
);

const backLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  border: "none",
  color: "#3b82f6",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  padding: "6px 0",
  marginBottom: 8,
};
