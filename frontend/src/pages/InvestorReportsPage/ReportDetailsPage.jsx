import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  FileText,
  Download,
  Archive,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  User,
} from "lucide-react";

import { getUpload, downloadFileUrl, downloadZipUrl, downloadSourceUrl } from "./api";
import { fmtUSD, fmtSignedUSD, incomeColor } from "./helpers";
import { StepIndicator, SkeletonRow, InvestorReportStyles } from "./ui";

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit",
  });
};

export default function ReportDetailsPage({ uploadId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState(null);
  const [files, setFiles] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getUpload(uploadId);
      setUpload(data.upload);
      setFiles(data.files || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Не удалось загрузить");
      onBack();
    } finally {
      setLoading(false);
    }
  }, [uploadId, onBack]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ width: "100%", paddingRight: 20 }}>
        <InvestorReportStyles />
        <StepIndicator current="details" />
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="styled-table" style={{ width: "100%" }}>
            <thead>
              <tr><th>Инвестор</th><th>Файл</th><th>Ст-ть</th><th>Доход</th><th></th></tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (!upload) return null;

  const meta = upload.meta || {};

  return (
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 50 }}>
      <InvestorReportStyles />
      <button onClick={onBack} style={backLinkStyle}>
        <ArrowLeft size={16} /> К истории
      </button>

      <StepIndicator current="details" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={28} color="#3b82f6" />
            Отчёт · {meta.reporting_date || "—"}
          </h1>
          <div style={{ marginTop: 10, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#64748b" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Calendar size={14} /> Загружено: <strong style={{ color: "#334155" }}>{fmtDate(upload.uploaded_at)}</strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <User size={14} /> Пользователь: <strong style={{ color: "#334155" }}>{upload.uploaded_by_username}</strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              Режим: <strong style={{ color: "#334155" }}>{upload.mode === "single" ? "по инвестору" : "сводный"}</strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              Формула: <strong style={{ color: "#334155" }}>Вариант {meta.formula || "B"}</strong>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={downloadSourceUrl(upload.id)}
             className="btn" style={{ background: "#e2e8f0", color: "#334155", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <FileSpreadsheet size={14} /> Исходный Excel
          </a>
          {files.length > 0 && (
            <a href={downloadZipUrl(upload.id)}
               className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Archive size={14} /> Скачать все (ZIP)
            </a>
          )}
        </div>
      </div>

      {/* Success banner */}
      <div className="card" style={{ background: "#f0fdf4", borderLeft: "4px solid #10b981", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <CheckCircle2 size={20} color="#10b981" />
        <div>
          <div style={{ fontWeight: 600, color: "#065f46" }}>
            Готово! Сгенерировано {files.length} {files.length === 1 ? "отчёт" : "отчётов"}
          </div>
          {upload.commentary && (
            <div style={{ fontSize: 12, color: "#047857", marginTop: 2 }}>
              Комментарий управляющего сохранён
            </div>
          )}
        </div>
      </div>

      {/* Files table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="styled-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Инвестор</th>
                <th>Файл</th>
                <th style={{ textAlign: "right" }}>Вложено</th>
                <th style={{ textAlign: "right" }}>Текущая ст-ть</th>
                <th style={{ textAlign: "right" }}>Доход за месяц</th>
                <th style={{ textAlign: "right", width: 160 }}>Скачать</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const d = f.data || {};
                return (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600, color: "#1e293b" }}>{f.investor_name}</td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>
                        {d.filename || `report_${f.id}.docx`}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(d.total_subscription)}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(d.current_value)}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: incomeColor(d.monthly_income) }}>
                      {fmtSignedUSD(d.monthly_income)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <a href={downloadFileUrl(upload.id, f.id)}
                         className="btn"
                         style={{ height: 32, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6, background: "#10b981", textDecoration: "none" }}
                         onMouseOver={(e) => (e.currentTarget.style.background = "#059669")}
                         onMouseOut={(e) => (e.currentTarget.style.background = "#10b981")}>
                        <Download size={14} />
                        .docx
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
