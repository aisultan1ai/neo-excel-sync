// ExcelReconcileToolsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  FileSpreadsheet,
  Play,
  Download,
  CheckCircle2,
  FileText,
  Settings2,
  RefreshCcw,
  Loader,
  Search,
} from "lucide-react";

// --- если у тебя токен хранится иначе — измени тут ---
const getAuthHeaders = () => {
  const token = localStorage.getItem("token"); // или "access_token" как у тебя
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// --- КАРТОЧКА ФАЙЛА + выбор колонок (как у тебя) ---
const FileSection = ({
  title,
  file,
  setFile,
  headers,
  setHeaders,
  color,
  fields, // [{label, value, setValue, defaultContains?}]
}) => {
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const foundHeaders = (data?.[0] || []).filter(Boolean);
        setHeaders(foundHeaders);

        // автоподстановка колонок по "contains"
        (fields || []).forEach((f) => {
          if (!f.defaultContains) return;
          const found = foundHeaders.find((h) =>
            String(h).toLowerCase().includes(String(f.defaultContains).toLowerCase())
          );
          if (found) f.setValue(found);
        });
      } catch (err) {
        console.error(err);
        toast.error("Ошибка чтения заголовков Excel");
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 350 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            background: color,
            padding: 10,
            borderRadius: 10,
            color: "white",
            boxShadow: `0 4px 10px ${color}40`,
          }}
        >
          <FileSpreadsheet size={24} />
        </div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#1e293b" }}>{title}</h3>
      </div>

      <div style={{ position: "relative", minHeight: file ? "auto" : 160 }}>
        <input
          type="file"
          className="file-input-hidden"
          style={{ zIndex: file ? 1 : 10 }}
          onChange={handleFileSelect}
          accept=".xlsx,.xls,.csv"
        />

        {file ? (
          <div className="uploaded-file-card" style={{ marginTop: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CheckCircle2 size={32} color="#16a34a" />
              <div style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 240,
                  }}
                >
                  {file.name}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>
            <label
              style={{
                cursor: "pointer",
                padding: 5,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              }}
              title="Заменить файл"
            >
              <RefreshCcw size={16} color="#64748b" />
              <input type="file" style={{ display: "none" }} onChange={handleFileSelect} accept=".xlsx,.xls,.csv" />
            </label>
          </div>
        ) : (
          <div className="file-upload-area" style={{ height: "100%", position: "absolute", width: "100%", top: 0 }}>
            <UploadCloud size={32} color="#94a3b8" style={{ marginBottom: 10 }} />
            <div style={{ textAlign: "center" }}>
              <span style={{ color: "#3b82f6", fontWeight: 600, fontSize: 16 }}>Выберите файл</span>
              <span style={{ display: "block", fontSize: 13, color: "#94a3b8", marginTop: 4 }}>или перетащите сюда</span>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          background: "#ffffff",
          padding: 15,
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          opacity: file ? 1 : 0.6,
          pointerEvents: file ? "all" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "#64748b", fontSize: 12, fontWeight: 700 }}>
          <Settings2 size={14} /> ВЫБОР СТОЛБЦОВ
        </div>

        {(fields || []).map((f, idx) => (
          <div className="input-group" style={{ marginBottom: idx === fields.length - 1 ? 0 : 10 }} key={idx}>
            <label className="input-label" style={{ fontSize: 13, color: "#475569" }}>
              {f.label}
            </label>
            <select
              className="text-input"
              value={f.value}
              onChange={(e) => f.setValue(e.target.value)}
              style={{ cursor: "pointer", appearance: "auto", padding: 8 }}
            >
              <option value="">-- Выберите --</option>
              {headers.map((h, i) => (
                <option key={i} value={h}>
                  {h}
                </option>
              ))}
              {!headers.includes(f.value) && f.value && <option value={f.value}>{f.value}</option>}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Таблица результата (как у тебя) ---
const ResultTable = ({ data, filterText, filterCol }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: 12 }}>
        <FileText size={64} style={{ opacity: 0.3, marginBottom: 20 }} />
        <p style={{ fontSize: 18, fontWeight: 500 }}>В этой категории данных нет</p>
      </div>
    );
  }

  const headers = Object.keys(data[0] || {});
  const q = (filterText || "").trim().toLowerCase();

  const filtered = !q
    ? data
    : data.filter((row) => {
        if (filterCol) return String(row?.[filterCol] ?? "").toLowerCase().includes(q);
        return headers.some((h) => String(row?.[h] ?? "").toLowerCase().includes(q));
      });

  return (
    <div className="result-table-wrapper" style={{ height: "100%", overflow: "auto", border: "none" }}>
      <table className="styled-table">
        <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {filtered.slice(0, 2000).map((row, i) => (
            <tr key={i}>
              {headers.map((h) => (
                <td key={h}>{String(row?.[h] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length > 2000 && (
        <div style={{ padding: 10, fontSize: 12, color: "#64748b" }}>
          Показаны первые 2000 строк из {filtered.length}. Уточните фильтр.
        </div>
      )}
    </div>
  );
};

const ExcelReconcileToolsPage = () => {
  const [mode, setMode] = useState("mode1"); // mode1, mode2, mode3

  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);

  const [headers1, setHeaders1] = useState([]);
  const [headers2, setHeaders2] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);

  const [token, setToken] = useState("");
  const [rows, setRows] = useState([]);

  const [filterText, setFilterText] = useState("");
  const [filterCol, setFilterCol] = useState("");

  // mode1
  const [m1_col1, setM1_col1] = useState("Ценная бумага");
  const [m1_op1, setM1_op1] = useState("Тип операции ФИ");
  const [m1_col2, setM1_col2] = useState("Instrument");
  const [m1_side2, setM1_side2] = useState("Side");

  // mode2
  const [m2_paper, setM2_paper] = useState("Ценная бумага");
  const [m2_amount, setM2_amount] = useState("Сумма в валюте");
  const [m2_minRepeats, setM2_minRepeats] = useState(2);
  const [m2_roundTo, setM2_roundTo] = useState(2);

  // mode3
  const [m3_paper1, setM3_paper1] = useState("Ценная бумага");
  const [m3_amount1, setM3_amount1] = useState("Сумма в валюте");
  const [m3_paper2, setM3_paper2] = useState("Instrument");
  const [m3_amount2, setM3_amount2] = useState("Amount");
  const [m3_roundTo, setM3_roundTo] = useState(2);

  // при смене режима — чистим
  useEffect(() => {
    setToken("");
    setRows([]);
    setFilterText("");
    setFilterCol("");
    setFile1(null);
    setFile2(null);
    setHeaders1([]);
    setHeaders2([]);
  }, [mode]);

  const activeHeaders = useMemo(() => (rows?.[0] ? Object.keys(rows[0]) : []), [rows]);

  const runTool = async () => {
    try {
      if ((mode === "mode1" || mode === "mode3") && (!file1 || !file2)) {
        return toast.warning("Выберите оба файла!");
      }
      if (mode === "mode2" && !file1) {
        return toast.warning("Выберите файл!");
      }

      setLoading(true);

      const fd = new FormData();
      fd.append("file1", file1);
      if (file2) fd.append("file2", file2);

      let url = "";
      if (mode === "mode1") {
        url = "/api/tools/reconcile/instrument-direction";
        fd.append("col1", m1_col1);
        fd.append("op1_col", m1_op1);
        fd.append("col2", m1_col2);
        fd.append("side2_col", m1_side2);
      } else if (mode === "mode2") {
        url = "/api/tools/reconcile/duplicates-single";
        fd.append("paper_col", m2_paper);
        fd.append("amount_col", m2_amount);
        fd.append("min_repeats", String(m2_minRepeats));
        fd.append("round_to", String(m2_roundTo));
      } else {
        url = "/api/tools/reconcile/amount-paper-two-files";
        fd.append("paper1_col", m3_paper1);
        fd.append("amount1_col", m3_amount1);
        fd.append("paper2_col", m3_paper2);
        fd.append("amount2_col", m3_amount2);
        fd.append("round_to", String(m3_roundTo));
      }

      const res = await axios.post(url, fd, {
        headers: { "Content-Type": "multipart/form-data", ...getAuthHeaders() },
      });

      if (res.data?.status !== "success") throw new Error("Ошибка сервера");

      setToken(res.data.token || "");
      setRows(res.data.summary || []);
      toast.success("Готово!");
    } catch (e) {
      toast.error("Ошибка: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!token) return toast.warning("Сначала запустите сверку");
    setLoadingExport(true);
    try {
      const res = await axios.get(`/api/tools/reconcile/download/${token}`, {
        responseType: "blob",
        headers: { ...getAuthHeaders() },
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Reconcile_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Ошибка экспорта");
    } finally {
      setLoadingExport(false);
    }
  };

  return (
    <div style={{ width: "100%", height: "calc(100vh - 40px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spin-anim { animation: spin 1s linear infinite; }
      `}</style>

      {/* верх */}
      <div style={{ flexShrink: 0, overflowY: "auto", paddingBottom: 20 }}>
        <h1 style={{ marginBottom: 20, fontSize: 28, color: "#1e293b" }}>Сверка Excel (Tools)</h1>

        <div className="card" style={{ padding: 22, border: "none", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <div className="tabs-container" style={{ marginBottom: 16 }}>
            <button className={`tab-btn ${mode === "mode1" ? "active" : ""}`} onClick={() => setMode("mode1")}>
              2 файла: Инструмент + операция
            </button>
            <button className={`tab-btn ${mode === "mode2" ? "active" : ""}`} onClick={() => setMode("mode2")}>
              1 файл: Дубликаты (Сумма + Бумага)
            </button>
            <button className={`tab-btn ${mode === "mode3" ? "active" : ""}`} onClick={() => setMode("mode3")}>
              2 файла: Расхождения (Сумма + Бумага)
            </button>
          </div>

          <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
            <FileSection
              title={mode === "mode2" ? "Файл" : "Файл 1"}
              color="#3b82f6"
              file={file1}
              setFile={setFile1}
              headers={headers1}
              setHeaders={setHeaders1}
              fields={
                mode === "mode1"
                  ? [
                      { label: "Файл 1: колонка инструмента", value: m1_col1, setValue: setM1_col1, defaultContains: "цен" },
                      { label: "Файл 1: колонка типа операции", value: m1_op1, setValue: setM1_op1, defaultContains: "тип" },
                    ]
                  : mode === "mode2"
                  ? [
                      { label: "Колонка бумаги", value: m2_paper, setValue: setM2_paper, defaultContains: "цен" },
                      { label: "Колонка суммы", value: m2_amount, setValue: setM2_amount, defaultContains: "сумм" },
                    ]
                  : [
                      { label: "Файл 1: колонка бумаги", value: m3_paper1, setValue: setM3_paper1, defaultContains: "цен" },
                      { label: "Файл 1: колонка суммы", value: m3_amount1, setValue: setM3_amount1, defaultContains: "сумм" },
                    ]
              }
            />

            {(mode === "mode1" || mode === "mode3") && (
              <>
                <div style={{ width: 1, background: "#e2e8f0", margin: "10px 0" }} />
                <FileSection
                  title="Файл 2"
                  color="#8b5cf6"
                  file={file2}
                  setFile={setFile2}
                  headers={headers2}
                  setHeaders={setHeaders2}
                  fields={
                    mode === "mode1"
                      ? [
                          { label: "Файл 2: колонка инструмента", value: m1_col2, setValue: setM1_col2, defaultContains: "instrument" },
                          { label: "Файл 2: колонка Side", value: m1_side2, setValue: setM1_side2, defaultContains: "side" },
                        ]
                      : [
                          { label: "Файл 2: колонка бумаги", value: m3_paper2, setValue: setM3_paper2, defaultContains: "instrument" },
                          { label: "Файл 2: колонка суммы", value: m3_amount2, setValue: setM3_amount2, defaultContains: "amount" },
                        ]
                  }
                />
              </>
            )}
          </div>

          {/* параметры */}
          {(mode === "mode2" || mode === "mode3") && (
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {mode === "mode2" && (
                <>
                  <input
                    className="text-input"
                    style={{ width: 220 }}
                    type="number"
                    min={2}
                    value={m2_minRepeats}
                    onChange={(e) => setM2_minRepeats(Number(e.target.value))}
                    placeholder="Минимум повторов"
                  />
                  <input
                    className="text-input"
                    style={{ width: 260 }}
                    type="number"
                    min={0}
                    max={6}
                    value={m2_roundTo}
                    onChange={(e) => setM2_roundTo(Number(e.target.value))}
                    placeholder="Округление (знаков)"
                  />
                </>
              )}
              {mode === "mode3" && (
                <input
                  className="text-input"
                  style={{ width: 260 }}
                  type="number"
                  min={0}
                  max={6}
                  value={m3_roundTo}
                  onChange={(e) => setM3_roundTo(Number(e.target.value))}
                  placeholder="Округление (знаков)"
                />
              )}
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 12 }}>
            <button
              className="btn"
              onClick={runTool}
              disabled={loading}
              style={{
                padding: "14px 40px",
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: loading ? "#94a3b8" : "#3b82f6",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <Loader size={18} className="spin-anim" /> Обработка...
                </>
              ) : (
                <>
                  <Play size={20} fill="white" /> Запустить
                </>
              )}
            </button>

            <button
              className="btn"
              onClick={handleExport}
              disabled={loadingExport || !token}
              style={{
                background: loadingExport ? "#94a3b8" : "#10b981",
                padding: "14px 22px",
                fontSize: 14,
                borderRadius: 12,
                cursor: loadingExport ? "wait" : token ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {loadingExport ? (
                <>
                  <Loader size={18} className="spin-anim" /> Экспорт...
                </>
              ) : (
                <>
                  <Download size={18} /> Excel
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* результаты */}
      <div className="card" style={{ padding: 0, border: "none", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div
          style={{
            padding: "12px 20px",
            background: "white",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: "#1e293b" }}>
            Результат
            <span style={{ marginLeft: 10, color: "#64748b", fontWeight: 600, fontSize: 12 }}>
              {rows?.length || 0}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b" }}>
              <Search size={16} />
            </div>

            <select
              value={filterCol}
              onChange={(e) => setFilterCol(e.target.value)}
              className="text-input"
              style={{ height: 38, padding: "6px 10px", borderRadius: 8, width: 220 }}
              disabled={!rows?.length}
            >
              <option value="">Все колонки</option>
              {activeHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Фильтр/поиск..."
              className="text-input"
              style={{ height: 38, padding: "6px 10px", borderRadius: 8, width: 260 }}
              disabled={!rows?.length}
            />
          </div>
        </div>

        <div style={{ flex: 1, background: "#ffffff", overflow: "hidden", position: "relative" }}>
          <ResultTable data={rows} filterText={filterText} filterCol={filterCol} />
        </div>
      </div>
    </div>
  );
};

export default ExcelReconcileToolsPage;
