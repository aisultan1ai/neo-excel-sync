import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  FileText,
  Plus,
  Users as UsersIcon,
  Calendar,
  User,
  Download,
  Trash2,
  Archive,
  ChevronRight,
  FileSpreadsheet,
  Search,
} from "lucide-react";

import { listUploads, deleteUpload, downloadZipUrl, downloadSourceUrl, templateUrl } from "./api";
import UploadPage from "./UploadPage";
import PreviewPage from "./PreviewPage";
import ReportDetailsPage from "./ReportDetailsPage";
import { ConfirmDialog, InvestorReportStyles, SkeletonRow } from "./ui";

const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                   "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

const fmtPeriod = (period_end) => {
  if (!period_end) return "—";
  const d = new Date(period_end);
  if (isNaN(d)) return period_end;
  return `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit",
  });
};

export default function InvestorReportsPage() {
  const [view, setView] = useState("list");
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // {id, label} или null

  const [previewData, setPreviewData] = useState(null);
  const [detailsUploadId, setDetailsUploadId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listUploads();
      setUploads(data || []);
    } catch (e) {
      toast.error("Не удалось загрузить историю");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredUploads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uploads;
    return uploads.filter((u) => {
      const period = fmtPeriod(u.period_end).toLowerCase();
      const fname = (u.source_filename || "").toLowerCase();
      const user = (u.uploaded_by_username || "").toLowerCase();
      return period.includes(q) || fname.includes(q) || user.includes(q);
    });
  }, [uploads, search]);

  const confirmDelete = (u) => {
    setDeleteTarget({
      id: u.id,
      label: `${fmtPeriod(u.period_end)} · ${u.files_count ?? 0} отчётов`,
    });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUpload(deleteTarget.id);
      toast.success("Загрузка удалена");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Ошибка удаления");
    } finally {
      setDeleteTarget(null);
    }
  };

  const goUpload = () => { setPreviewData(null); setView("upload"); };
  const goPreview = (data) => { setPreviewData(data); setView("preview"); };
  const goDetails = (uploadId) => { setDetailsUploadId(uploadId); setView("details"); };
  const goList = () => { setView("list"); load(); };

  if (view === "upload") {
    return <UploadPage onPreview={goPreview} onCancel={goList} />;
  }
  if (view === "preview" && previewData) {
    return (
      <PreviewPage
        data={previewData}
        onCancel={() => setView("upload")}
        onGenerated={(res) => goDetails(res.upload_id)}
      />
    );
  }
  if (view === "details" && detailsUploadId) {
    return <ReportDetailsPage uploadId={detailsUploadId} onBack={goList} />;
  }

  return (
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 50 }}>
      <InvestorReportStyles />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={28} color="#3b82f6" />
            Отчёты инвесторов
          </h1>
          <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: 14 }}>
            Algo Alliance Umbrella Fund OEIC Limited
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={templateUrl("consolidated")}
             className="btn"
             style={{ background: "#e2e8f0", color: "#334155", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}
             title="Скачать пустой Excel-шаблон">
            <FileSpreadsheet size={16} />
            Шаблон Excel
          </a>
          <button className="btn" onClick={goUpload}
            style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plus size={16} />
            Загрузить отчёт
          </button>
        </div>
      </div>

      {/* Search / stats bar */}
      {(loading || uploads.length > 0) && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 400 }}>
            <Search size={14} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              placeholder="Поиск по периоду, файлу, пользователю..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ir-search-input"
              style={{
                width: "100%", padding: "8px 12px 8px 34px",
                border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13,
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {loading ? "..." : `${filteredUploads.length} из ${uploads.length} загрузок`}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ overflowX: "auto" }}>
            <table className="styled-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Период</th>
                  <th>Режим</th>
                  <th style={{ textAlign: "center" }}>Инвесторов</th>
                  <th>Загружено</th>
                  <th>Пользователь</th>
                  <th style={{ textAlign: "right", width: 240 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}
              </tbody>
            </table>
          </div>
        ) : uploads.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ display: "inline-flex", background: "#eff6ff", padding: 16, borderRadius: "50%", marginBottom: 14 }}>
              <FileText size={32} color="#3b82f6" />
            </div>
            <h3 style={{ margin: "8px 0", color: "#1e293b" }}>Пока нет ни одной загрузки</h3>
            <p style={{ color: "#64748b", margin: "0 0 20px" }}>Загрузите сводный Excel фонда, чтобы сгенерировать отчёты инвесторам.</p>
            <button className="btn" onClick={goUpload}>
              <Plus size={16} style={{ marginRight: 6 }} />
              Загрузить первый отчёт
            </button>
          </div>
        ) : filteredUploads.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>
            <Search size={32} color="#cbd5e1" style={{ marginBottom: 10 }} />
            <div>Ничего не найдено по запросу «{search}»</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="styled-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Период</th>
                  <th>Режим</th>
                  <th style={{ textAlign: "center" }}>Инвесторов</th>
                  <th>Загружено</th>
                  <th>Пользователь</th>
                  <th style={{ textAlign: "right", width: 240 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredUploads.map((u) => (
                  <tr key={u.id} style={{ cursor: "pointer" }}
                      onClick={() => goDetails(u.id)}>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "inline-flex", background: "#eff6ff", padding: 6, borderRadius: 8 }}>
                        <Calendar size={16} color="#3b82f6" />
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "#1e293b" }}>{fmtPeriod(u.period_end)}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{u.source_filename}</div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12,
                        background: u.mode === "single" ? "#fef3c7" : "#dbeafe",
                        color:      u.mode === "single" ? "#92400e" : "#1e40af",
                      }}>
                        {u.mode === "single" ? "По инвестору" : "Сводный"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                        <UsersIcon size={14} color="#64748b" />
                        {u.files_count ?? 0}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "#64748b" }}>{fmtDate(u.uploaded_at)}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#334155" }}>
                        <User size={14} color="#94a3b8" />
                        {u.uploaded_by_username}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <a href={downloadZipUrl(u.id)} title="Скачать все отчёты в ZIP"
                           style={btnIconStyle}>
                          <Archive size={14} />
                        </a>
                        <a href={downloadSourceUrl(u.id)} title="Скачать исходный Excel"
                           style={btnIconStyle}>
                          <Download size={14} />
                        </a>
                        <button type="button" onClick={() => confirmDelete(u)} title="Удалить загрузку"
                                style={{...btnIconStyle, color: "#ef4444"}}>
                          <Trash2 size={14} />
                        </button>
                        <button type="button" onClick={() => goDetails(u.id)} title="Открыть детали"
                                style={{...btnIconStyle, color: "#3b82f6"}}>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Удалить загрузку?"
        message={deleteTarget ? `Будет удалено: ${deleteTarget.label}. Действие нельзя отменить.` : ""}
        confirmText="Удалить"
        cancelText="Отмена"
        danger
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

const btnIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  border: "1px solid #e2e8f0",
  background: "#fff",
  borderRadius: 6,
  cursor: "pointer",
  color: "#64748b",
  textDecoration: "none",
};
