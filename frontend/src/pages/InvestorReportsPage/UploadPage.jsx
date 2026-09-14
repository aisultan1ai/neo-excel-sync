import React, { useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  X,
  FileText,
  Info,
  Download,
} from "lucide-react";

import { preview as apiPreview, templateUrl } from "./api";

const ACCEPTED = ".xls,.xlsx,.xlsm";

export default function UploadPage({ onPreview, onCancel }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState("consolidated"); // consolidated | single
  const [formula, setFormula] = useState("B");
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
      const { data } = await apiPreview(file, mode, formula);
      onPreview(data);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Не удалось прочитать Excel";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 50 }}>
      <button onClick={onCancel} style={backLinkStyle}>
        <ArrowLeft size={16} /> К истории
      </button>

      <h1 style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
        <FileText size={28} color="#3b82f6" />
        Загрузка месячного отчёта
      </h1>
      <p style={{ marginTop: 0, marginBottom: 24, color: "#64748b", fontSize: 14 }}>
        Загрузите Excel фонда — система распарсит и покажет превью перед генерацией `.docx`.
      </p>

      {/* ── Режим загрузки ── */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 14px 0", fontSize: 15 }}>Режим загрузки</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ModeCard
            active={mode === "consolidated"}
            onClick={() => setMode("consolidated")}
            title="Один сводный файл"
            subtitle="Excel со всеми инвесторами (листы «В разбивке инвестор ...»)"
          />
          <ModeCard
            active={mode === "single"}
            onClick={() => setMode("single")}
            title="Файл по инвестору"
            subtitle="Отдельный Excel для одного инвестора"
          />
        </div>
      </div>

      {/* ── Формула Income ── */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 14px 0", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          Формула «Income for month»
          <span title="Как считать доход инвестора за отчётный месяц" style={{ display: "inline-flex" }}>
            <Info size={14} color="#94a3b8" />
          </span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ModeCard
            active={formula === "B"}
            onClick={() => setFormula("B")}
            title="Как в Excel бухгалтерии (Вариант B)"
            subtitle="value_start = Σ units × max(subscription_price, NAV_start)"
          />
          <ModeCard
            active={formula === "A"}
            onClick={() => setFormula("A")}
            title="По дате входа (Вариант A)"
            subtitle="Новые за месяц — от суммы подписки, старые — от NAV_start"
          />
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Excel файл</h3>
          <a href={templateUrl(mode)}
             style={{
               display: "inline-flex", alignItems: "center", gap: 6,
               fontSize: 13, color: "#3b82f6", textDecoration: "none",
               background: "#eff6ff", padding: "6px 12px", borderRadius: 6,
               border: "1px solid #dbeafe",
             }}
             title={`Скачать пустой шаблон Excel (${mode === "single" ? "по инвестору" : "сводный"})`}>
            <Download size={14} />
            Скачать шаблон
          </a>
        </div>
        <div
          style={{
            border: `2px dashed ${dragOver ? "#3b82f6" : file ? "#10b981" : "#cbd5e1"}`,
            borderRadius: 12,
            padding: "32px 20px",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: dragOver ? "#eff6ff" : file ? "#f0fdf4" : "#f8fafc",
            transition: "all 0.2s ease",
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
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ background: "#e0f2fe", padding: 14, borderRadius: "50%" }}>
                <Upload size={28} color="#3b82f6" />
              </div>
              <div>
                <span style={{ color: "#3b82f6", fontWeight: 600 }}>Нажмите для выбора файла</span>
                <br />
                <span style={{ fontSize: 13, color: "#94a3b8" }}>или перетащите файл сюда</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", background: "#f1f5f9", padding: "4px 12px", borderRadius: 20 }}>
                XLS · XLSX &nbsp;|&nbsp; до 20 МБ
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <FileSpreadsheet size={44} color="#10b981" />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 15 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {(file.size / 1024).toFixed(1)} KB · {file.name.split(".").pop().toUpperCase()}
                </div>
              </div>
              <button onClick={clearFile}
                style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginLeft: 12 }}>
                <X size={16} color="#ef4444" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} className="btn" style={{ background: "#e2e8f0", color: "#334155" }}>
          Отмена
        </button>
        <button
          onClick={handleSubmit}
          disabled={!file || loading}
          className="btn"
          style={{ height: 42, padding: "0 28px", opacity: !file || loading ? 0.6 : 1 }}
        >
          {loading ? "Читаем Excel..." : "Далее — превью"}
        </button>
      </div>
    </div>
  );
}

const ModeCard = ({ active, onClick, title, subtitle }) => (
  <button
    onClick={onClick}
    style={{
      textAlign: "left",
      padding: 14,
      borderRadius: 10,
      border: `2px solid ${active ? "#3b82f6" : "#e2e8f0"}`,
      background: active ? "#eff6ff" : "#fff",
      cursor: "pointer",
      transition: "all 0.15s ease",
    }}
  >
    <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{subtitle}</div>
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
