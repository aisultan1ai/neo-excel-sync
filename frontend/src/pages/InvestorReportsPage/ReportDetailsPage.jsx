import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Download,
  Archive,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";

import { getUpload, downloadFileUrl, downloadZipUrl, downloadSourceUrl } from "./api";
import { fmtUSD, fmtSignedUSD, incomeColor } from "./helpers";
import { PageTopBar, SkeletonRow, InvestorReportStyles } from "./ui";

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
      <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto", paddingRight: 20, paddingBottom: 50 }}>
        <InvestorReportStyles />
        <PageTopBar onBack={onBack} backLabel="К истории" current="details" />
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
    <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto", paddingRight: 20, paddingBottom: 50 }}>
      <InvestorReportStyles />

      <PageTopBar onBack={onBack} backLabel="К истории" current="details" />

      {/* Компактный header: дата + метаинфа + действия — в одну карточку */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", background: "#f8fafc", borderRadius: 10,
        border: "1px solid #f1f5f9", marginBottom: 16, gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", flex: 1 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.3 }}>Reporting Date</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{meta.reporting_date || "—"}</div>
          </div>
          <div style={{ borderLeft: "1px solid #e2e8f0", height: 30 }} />
          <MetaCol label="Загружено" value={fmtDate(upload.uploaded_at)} />
          <MetaCol label="Пользователь" value={upload.uploaded_by_username} />
          <MetaCol label="Режим" value={upload.mode === "single" ? "по инвестору" : "сводный"} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={downloadSourceUrl(upload.id)} className="btn"
             style={{ background: "transparent", color: "#64748b", padding: "6px 12px", boxShadow: "none", border: "1px solid #e2e8f0", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 12 }}>
            <FileSpreadsheet size={13} /> Excel
          </a>
          {files.length > 0 && (
            <a href={downloadZipUrl(upload.id)} className="btn"
               style={{ padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 12 }}>
              <Archive size={13} /> ZIP · {files.length}
            </a>
          )}
        </div>
      </div>

      {/* Success mini-banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", marginBottom: 16,
        background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0",
      }}>
        <CheckCircle2 size={16} color="#10b981" />
        <span style={{ fontSize: 13, color: "#065f46", fontWeight: 500 }}>
          Сгенерировано {files.length} {files.length === 1 ? "отчёт" : "отчётов"}
          {upload.commentary && <span style={{ color: "#047857", fontWeight: 400 }}> · commentary сохранён</span>}
        </span>
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
                <th style={{ textAlign: "right", width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const d = f.data || {};
                return (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600, color: "#1e293b" }}>{f.investor_name}</td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>
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
                         style={{ height: 30, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 5, background: "#10b981", textDecoration: "none", fontSize: 12 }}>
                        <Download size={13} />
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

const MetaCol = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>
    <div style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>{value}</div>
  </div>
);
