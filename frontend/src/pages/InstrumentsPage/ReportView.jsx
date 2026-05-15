import React, { useState } from "react";
import { toast } from "react-toastify";
import { FileText, Loader2, Copy, ClipboardCheck, Info } from "lucide-react";
import axios from "axios";
import { SimpleFileBlock } from "./ui";

const ReportView = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!file) return toast.warning("Сначала выберите файл.");
    setLoading(true);
    setReportText("");
    setCopied(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("/api/v1/tools/generate-trade-report", formData);
      if (res.data.status === "success") {
        setReportText(res.data.report);
        toast.success("Отчет успешно сформирован!");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка генерации отчета");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!reportText) return;
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("Текст скопирован!");
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%", maxWidth: "900px", margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: "30px" }}>
        <div style={{ background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: "12px", padding: "15px 20px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "start" }}>
          <Info size={20} color="#3b82f6" style={{ marginTop: "2px" }} />
          <div style={{ fontSize: "14px", color: "#1e40af", lineHeight: "1.5" }}>
            <strong>Как это работает:</strong> Загрузите Excel файл. Система ищет колонки{" "}
            <code>Instrument</code>, <code>Amount</code>, <code>Quote amount</code>. Сделки
            группируются, и формируется текстовое описание для отчета.
          </div>
        </div>

        <SimpleFileBlock title="Файл со сделками" description="Excel (.xlsx) или CSV" color="#f59e0b" file={file} setFile={setFile} showSelect={false} />
      </div>

      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <button
          className="custom-btn" onClick={handleGenerate} disabled={loading}
          style={{ padding: "14px 40px", fontSize: "16px", fontWeight: 600, background: loading ? "#94a3b8" : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", color: "white", border: "none", borderRadius: "50px", boxShadow: "0 4px 6px -1px rgba(245,158,11,0.3)", cursor: loading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "10px" }}
        >
          {loading ? <Loader2 className="spin" size={20} /> : <FileText size={20} />}
          {loading ? "Генерация..." : "Создать отчет"}
        </button>
      </div>

      {reportText && (
        <div className="fade-in" style={{ flex: 1, padding: "25px", display: "flex", flexDirection: "column", background: "white", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", minHeight: "300px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #f1f5f9" }}>
            <h3 style={{ margin: 0, color: "#1e293b" }}>Результат генерации:</h3>
            <button
              className="custom-btn" onClick={copyToClipboard}
              style={{ display: "flex", alignItems: "center", gap: "8px", border: `1px solid ${copied ? "#16a34a" : "#cbd5e1"}`, background: copied ? "#dcfce7" : "white", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", color: copied ? "#15803d" : "#475569", fontWeight: 500, fontSize: "14px" }}
            >
              {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
              {copied ? "Скопировано!" : "Копировать текст"}
            </button>
          </div>
          <textarea
            readOnly value={reportText}
            style={{ flex: 1, width: "100%", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace', fontSize: "13px", lineHeight: "1.6", resize: "none", outline: "none", background: "#f8fafc", color: "#334155" }}
          />
        </div>
      )}
    </div>
  );
};

export default ReportView;
