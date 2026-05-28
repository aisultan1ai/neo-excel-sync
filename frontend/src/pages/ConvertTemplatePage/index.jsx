import React, { useRef, useState } from "react";
import axios from "axios";
import {
  ArrowRightLeft,
  Upload,
  FileSpreadsheet,
  FileText,
  X,
  Download,
  AlertCircle,
  CheckCircle2,
  Hash,
  BarChart2,
  CalendarDays,
  ShieldAlert,
  TriangleAlert,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { toast } from "react-toastify";

const EXCHANGES = ["OKXE", "BINA"];
const DEFAULT_ACCOUNT = "#33755 Alexander Krasnyy HRP Guido Binance 2";
const ACCEPTED = ".csv,.xlsx,.xls";

// ── Row severity helpers ─────────────────────────────────────
const ROW_BG = {
  error:   { background: "#fef2f2" },
  warning: { background: "#fffbeb" },
};

const SEV_BADGE = {
  error:   { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca", label: "Ошибка" },
  warning: { bg: "#fffbeb", color: "#92400e", border: "#fde68a", label: "Предупреждение" },
};

// ── Sub-components ───────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div
    className="card"
    style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", marginBottom: 0 }}
  >
    <div style={{ background: `${color}18`, borderRadius: 10, padding: 10 }}>
      <Icon size={22} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>{value}</div>
    </div>
  </div>
);

const ValidationSummary = ({ validation }) => {
  const { total_errors, total_warnings, rows_with_errors, rows_with_warnings } = validation;
  const clean = total_errors === 0 && total_warnings === 0;

  if (clean) {
    return (
      <div className="card" style={{ borderLeft: "5px solid #10b981", background: "#f0fdf4", padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck size={22} color="#10b981" />
        <div>
          <div style={{ fontWeight: 600, color: "#065f46" }}>Данные корректны</div>
          <div style={{ fontSize: 13, color: "#047857" }}>Все проверки пройдены — ошибок и предупреждений не обнаружено</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {total_errors > 0 && (
        <div className="card" style={{ flex: 1, minWidth: 200, borderLeft: "4px solid #ef4444", background: "#fef2f2", padding: "14px 18px", marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ShieldAlert size={18} color="#ef4444" />
            <span style={{ fontWeight: 600, color: "#b91c1c", fontSize: 14 }}>Критические ошибки</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#7f1d1d" }}>{total_errors}</div>
          <div style={{ fontSize: 12, color: "#b91c1c" }}>в {rows_with_errors} {rows_with_errors === 1 ? "строке" : "строках"}</div>
        </div>
      )}
      {total_warnings > 0 && (
        <div className="card" style={{ flex: 1, minWidth: 200, borderLeft: "4px solid #f59e0b", background: "#fffbeb", padding: "14px 18px", marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <TriangleAlert size={18} color="#f59e0b" />
            <span style={{ fontWeight: 600, color: "#92400e", fontSize: 14 }}>Предупреждения</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#78350f" }}>{total_warnings}</div>
          <div style={{ fontSize: 12, color: "#b45309" }}>в {rows_with_warnings} {rows_with_warnings === 1 ? "строке" : "строках"}</div>
        </div>
      )}
    </div>
  );
};

const IssueRow = ({ item, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen || false);
  const sev = SEV_BADGE[item.severity];

  return (
    <div style={{ borderBottom: "1px solid #f1f5f9" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer", userSelect: "none" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontSize: 12, color: "#64748b", minWidth: 52 }}>#{item.row_num}</span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "#334155", flex: 1 }}>
          Trade ID: <strong>{item.trade_id}</strong>
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20,
          background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`,
        }}>
          {sev.label} ({item.issues.length})
        </span>
        {open ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
      </div>

      {open && (
        <div style={{ padding: "0 16px 12px 68px", display: "flex", flexDirection: "column", gap: 5 }}>
          {item.issues.map((iss, j) => (
            <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              {iss.type === "error"
                ? <AlertCircle size={14} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />
                : <TriangleAlert size={14} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
              }
              <span style={{ fontSize: 12, color: "#475569" }}>
                <strong style={{ color: "#1e293b" }}>{iss.field}:</strong> {iss.msg}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ValidationReport = ({ validation }) => {
  const { issues } = validation;
  if (!issues || issues.length === 0) return null;

  const [expanded, setExpanded] = useState(true);
  const errorRows = issues.filter((r) => r.severity === "error");
  const warnRows = issues.filter((r) => r.severity === "warning");

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{ padding: "16px 20px", borderBottom: expanded ? "1px solid #e2e8f0" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
          <ShieldAlert size={18} color="#ef4444" />
          Отчёт о проблемах
          <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>
            ({issues.length} {issues.length === 1 ? "строка" : issues.length < 5 ? "строки" : "строк"})
          </span>
        </h3>
        {expanded ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
      </div>

      {expanded && (
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {errorRows.length > 0 && (
            <>
              <div style={{ padding: "8px 16px", background: "#fef2f2", fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Критические ошибки — {errorRows.length} строк
              </div>
              {errorRows.map((item) => (
                <IssueRow key={item.row_num} item={item} defaultOpen={errorRows.length <= 3} />
              ))}
            </>
          )}
          {warnRows.length > 0 && (
            <>
              <div style={{ padding: "8px 16px", background: "#fffbeb", fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Предупреждения — {warnRows.length} строк
              </div>
              {warnRows.map((item) => (
                <IssueRow key={item.row_num} item={item} defaultOpen={false} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────

const ConvertTemplatePage = () => {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [exchange, setExchange] = useState("OKXE");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [splitExport, setSplitExport] = useState(false);

  const isExcel = file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"));

  const handleFileChange = (picked) => {
    if (!picked) return;
    const ext = picked.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      toast.error("Допустимые форматы: CSV, XLSX, XLS");
      return;
    }
    setFile(picked);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileChange(e.dataTransfer.files[0]);
  };

  const clearFile = (e) => {
    e.stopPropagation();
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProcess = async () => {
    if (!file) { toast.error("Выберите файл для конвертации"); return; }
    if (!account.trim()) { toast.error("Введите номер счёта"); return; }

    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("account", account.trim());
    formData.append("exchange", exchange);

    try {
      const res = await axios.post("/api/v1/convert-template/process", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      const v = res.data.validation;
      if (v.total_errors > 0) {
        toast.warning(`Обработано ${res.data.total} строк — найдено ${v.total_errors} ошибок`);
      } else {
        toast.success(`Обработано ${res.data.total} строк`);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Ошибка соединения с сервером";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!result?.result_id) return;
    const params = splitExport ? "?split=true" : "";
    window.location.href = `/api/v1/convert-template/export/${result.result_id}${params}`;
  };

  return (
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 50 }}>
      <h1 style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
        <ArrowRightLeft size={28} color="#3b82f6" />
        Конверт Шаблон
      </h1>
      <p style={{ marginTop: 0, marginBottom: 24, color: "#64748b", fontSize: 14 }}>
        Конвертация торговых отчётов (Binance CSV / Excel) в стандартный шаблон Excel
      </p>

      {/* ── Upload ── */}
      <div className="card" style={{ padding: 28 }}>
        <h3 style={{ margin: "0 0 18px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <Upload size={20} color="#3b82f6" />
          Шаг 1. Загрузка файла
        </h3>

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
          <input ref={fileInputRef} type="file" accept={ACCEPTED} hidden
            onChange={(e) => handleFileChange(e.target.files[0])} />

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
                CSV · XLSX · XLS &nbsp;|&nbsp; до 50 МБ
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              {isExcel
                ? <FileSpreadsheet size={44} color="#10b981" />
                : <FileText size={44} color="#10b981" />
              }
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 15 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {(file.size / 1024).toFixed(1)} KB &nbsp;·&nbsp; {file.name.split(".").pop().toUpperCase()}
                </div>
              </div>
              <button onClick={clearFile} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginLeft: 12 }}>
                <X size={16} color="#ef4444" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Params ── */}
      <div className="card" style={{ padding: 28 }}>
        <h3 style={{ margin: "0 0 18px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <Hash size={20} color="#3b82f6" />
          Шаг 2. Параметры конвертации
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "end" }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Номер счёта (Account)</label>
            <input className="text-input" value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="Введите номер счёта..." />
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Биржа (Exchange)</label>
            <select className="text-input" value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              style={{ cursor: "pointer" }}>
              {EXCHANGES.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={handleProcess} disabled={loading || !file}
            style={{ height: 44, padding: "0 32px", opacity: !file || loading ? 0.6 : 1 }}>
            {loading ? "Обработка..." : "Конвертировать"}
          </button>
        </div>
      </div>

      {/* ── Process error ── */}
      {error && (
        <div className="card" style={{ borderLeft: "5px solid #ef4444", backgroundColor: "#fef2f2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#b91c1c" }}>
            <AlertCircle size={20} />
            <strong>Ошибка</strong>
          </div>
          <p style={{ margin: "8px 0 0 0", color: "#7f1d1d" }}>{error}</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <>
          {/* Stats row */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard icon={CheckCircle2} label="Строк обработано" value={result.total} color="#10b981" />
            <StatCard icon={BarChart2} label="Инструментов" value={result.instruments} color="#3b82f6" />
            <StatCard icon={CalendarDays} label="Период дат" value={result.date_range} color="#8b5cf6" />
          </div>

          {/* Validation summary */}
          <div style={{ marginBottom: 16 }}>
            <ValidationSummary validation={result.validation} />
          </div>

          {/* Preview table */}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <FileSpreadsheet size={20} color="#3b82f6" />
                  Предпросмотр (первые 10 строк)
                </h3>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, display: "flex", gap: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 2, display: "inline-block" }} />
                    Критическая ошибка
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 2, display: "inline-block" }} />
                    Предупреждение
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={splitExport}
                    onChange={(e) => setSplitExport(e.target.checked)}
                    style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#3b82f6" }}
                  />
                  <span style={{ fontSize: 13, color: "#475569", whiteSpace: "nowrap" }}>
                    Разбить по 5000 строк
                    {splitExport && result?.total > 5000 && (
                      <span style={{ marginLeft: 5, color: "#3b82f6", fontWeight: 600 }}>
                        ({Math.ceil(result.total / 5000)} файла → .zip)
                      </span>
                    )}
                  </span>
                </label>
                <button
                  className="btn"
                  onClick={handleExport}
                  style={{ background: "#10b981", display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 20px", whiteSpace: "nowrap" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#059669")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#10b981")}
                >
                  <Download size={16} />
                  {splitExport && result?.total > 5000 ? "Скачать ZIP" : "Скачать Excel"}
                </button>
              </div>
            </div>

            <div className="result-table-wrapper" style={{ maxHeight: 440, overflowY: "auto" }}>
              <table className="styled-table">
                <thead>
                  <tr>
                    <th style={{ width: 28, padding: "12px 8px" }} />
                    {result.columns.map((col) => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, i) => {
                    const sev = row._severity;
                    const rowBg = ROW_BG[sev] || {};
                    const issues = row._issues || [];
                    const issueFields = new Set(issues.map((iss) => iss.field));

                    return (
                      <tr key={i} style={rowBg} title={issues.map((iss) => `${iss.field}: ${iss.msg}`).join("\n") || undefined}>
                        {/* Severity indicator cell */}
                        <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}>
                          {sev === "error" && <AlertCircle size={14} color="#ef4444" />}
                          {sev === "warning" && <TriangleAlert size={14} color="#f59e0b" />}
                        </td>

                        {result.columns.map((col) => {
                          const fieldMap = {
                            "ID": "Trade ID",
                            "Side": "Side",
                            "Price": "Price",
                            "Amount": "Quantity",
                            "Quote amount": "Amount",
                            "Commission": "Fee",
                            "Trade date": "Time",
                            "Transact time": "Time",
                          };
                          const srcField = fieldMap[col];
                          const cellHasIssue = srcField && issueFields.has(srcField);
                          const issForField = issues.filter((iss) => iss.field === srcField);
                          const cellIsError = issForField.some((iss) => iss.type === "error");

                          let cellStyle = {};
                          if (col === "Side") {
                            cellStyle = { color: row[col] === "BUY" ? "#10b981" : "#ef4444", fontWeight: 600 };
                          }
                          if (cellHasIssue) {
                            cellStyle = {
                              ...cellStyle,
                              background: cellIsError ? "#fee2e2" : "#fef9c3",
                              fontWeight: 600,
                              borderBottom: `2px solid ${cellIsError ? "#fca5a5" : "#fde047"}`,
                            };
                          }

                          return (
                            <td key={col} style={cellStyle}
                              title={issForField.length ? issForField.map((iss) => iss.msg).join("; ") : undefined}>
                              {row[col] ?? ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "10px 22px", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#94a3b8" }}>
              Показаны первые 10 из {result.total} строк · Наведите на ячейку для деталей
            </div>
          </div>

          {/* Validation report */}
          <ValidationReport validation={result.validation} />
        </>
      )}
    </div>
  );
};

export default ConvertTemplatePage;
