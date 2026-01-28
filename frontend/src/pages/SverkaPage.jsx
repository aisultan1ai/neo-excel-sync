// src/pages/SverkaPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
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

// ------------------------------
// Helpers (POD/FT selection)
// ------------------------------
const parseDateToISO = (v) => {
  if (!v) return "";
  // already ISO
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();

  // excel serial date
  if (typeof v === "number" && Number.isFinite(v)) {
    const dt = XLSX.SSF.parse_date_code(v);
    if (!dt) return "";
    const mm = String(dt.m).padStart(2, "0");
    const dd = String(dt.d).padStart(2, "0");
    return `${dt.y}-${mm}-${dd}`;
  }

  // dd.mm.yyyy or dd/mm/yyyy
  if (typeof v === "string") {
    const s = v.trim();
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, "0");
      const mm = String(m[2]).padStart(2, "0");
      return `${m[3]}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return "";
};

const podftRowKey = (r) => {
  const dt = parseDateToISO(r?.["Дата валютирования"] ?? r?.["value_date"] ?? r?.["Value date"]);
  const acct = String(r?.["Субсчет"] ?? r?.["Account"] ?? r?.["account"] ?? "").trim();
  const instr = String(r?.["Instrument"] ?? r?.["инструмент"] ?? r?.["instrument"] ?? "").trim();
  const amt = String(r?.["Сумма тг"] ?? r?.["amount_tg"] ?? r?.["Amount tg"] ?? "").trim();
  const side = String(r?.["Side"] ?? r?.["side"] ?? "").trim();
  // достаточно стабильный ключ для выбора
  return [dt, acct, instr, side, amt].join("|");
};

const buildPodftPayloadTrade = (r) => {
  const value_date = parseDateToISO(r?.["Дата валютирования"] ?? r?.["value_date"] ?? r?.["Value date"]);

  const num = (x) => {
    if (x === null || x === undefined || x === "") return null;
    if (typeof x === "number") return x;
    const s = String(x).replace(/\s+/g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  return {
    account: (r?.["Субсчет"] ?? r?.["Account"] ?? r?.["account"] ?? null) || null,
    instrument: (r?.["Instrument"] ?? r?.["инструмент"] ?? r?.["instrument"] ?? null) || null,
    side: (r?.["Side"] ?? r?.["side"] ?? null) || null,
    trading_dt: (r?.["Trading date"] ?? r?.["trading_dt"] ?? null) || null,
    deal_dt: (r?.["Deal date"] ?? r?.["deal_dt"] ?? null) || null,
    value_date: value_date || null,
    qty: num(r?.["Qty"] ?? r?.["qty"] ?? null),
    amount_tg: num(r?.["Сумма тг"] ?? r?.["amount_tg"] ?? null),
  };
};

// ------------------------------
// FileSection (upload + detect headers + choose columns)
// ------------------------------
const FileSection = ({
  title,
  file,
  setFile,
  headers,
  idCol,
  setIdCol,
  accCol,
  setAccCol,
  color,
  defaultIdName,
  defaultAccName,
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
        const wsname = wb.SheetNames?.[0];
        const ws = wb.Sheets?.[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data && data.length > 0) {
          const foundHeaders = data[0] || [];
          headers?.onLoad?.(foundHeaders);

          // Try auto-select ID column
          if (defaultIdName) {
            const foundId = foundHeaders.find((h) =>
              String(h || "")
                .toLowerCase()
                .trim()
                .includes(String(defaultIdName).toLowerCase().trim())
            );
            if (foundId) setIdCol(foundId);
          }

          // Try auto-select Account/Subaccount column
          const foundAcc = foundHeaders.find((h) => {
            const hs = String(h || "").toLowerCase();
            return (
              (defaultAccName && hs.includes(String(defaultAccName).toLowerCase())) ||
              hs.includes("account") ||
              hs.includes("счет") ||
              hs.includes("субсчет") ||
              hs.includes("subaccount")
            );
          });
          if (foundAcc) setAccCol(foundAcc);
        }
      } catch (err) {
        console.error("Ошибка чтения заголовков", err);
        toast.error("Не удалось прочитать заголовки файла");
      }
    };

    reader.readAsBinaryString(selectedFile);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minWidth: "350px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            background: color,
            padding: "10px",
            borderRadius: "10px",
            color: "white",
            boxShadow: `0 4px 10px ${color}40`,
          }}
        >
          <FileSpreadsheet size={24} />
        </div>
        <h3
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 600,
            color: "#1e293b",
          }}
        >
          {title}
        </h3>
      </div>

      <div
        style={{
          position: "relative",
          minHeight: file ? "auto" : "160px",
          transition: "min-height 0.3s",
        }}
      >
        <input
          type="file"
          className="file-input-hidden"
          style={{ zIndex: file ? 1 : 10 }}
          onChange={handleFileSelect}
          accept=".xlsx, .xls, .csv"
        />

        {file ? (
          <div className="uploaded-file-card" style={{ marginTop: "0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <CheckCircle2 size={32} color="#16a34a" />
              <div style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "15px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "220px",
                  }}
                >
                  {file.name}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>

            <label
              style={{
                cursor: "pointer",
                padding: "5px",
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              }}
              title="Заменить файл"
            >
              <RefreshCcw size={16} color="#64748b" />
              <input
                type="file"
                style={{ display: "none" }}
                onChange={handleFileSelect}
                accept=".xlsx, .xls, .csv"
              />
            </label>
          </div>
        ) : (
          <div
            className="file-upload-area"
            style={{
              height: "100%",
              position: "absolute",
              width: "100%",
              top: 0,
            }}
          >
            <UploadCloud size={32} color="#94a3b8" style={{ marginBottom: "10px" }} />
            <div style={{ textAlign: "center" }}>
              <span style={{ color: "#3b82f6", fontWeight: 600, fontSize: "16px" }}>
                Выберите файл
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "#94a3b8",
                  marginTop: "4px",
                }}
              >
                или перетащите сюда
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          background: "#ffffff",
          padding: "15px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          opacity: file ? 1 : 0.6,
          pointerEvents: file ? "all" : "none",
          transition: "all 0.3s",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "10px",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          <Settings2 size={14} /> ВЫБОР СТОЛБЦОВ
        </div>

        <div className="input-group" style={{ marginBottom: "10px" }}>
          <label className="input-label" style={{ fontSize: "13px", color: "#475569" }}>
            Уникальный ID сделки
          </label>
          <select
            className="text-input"
            value={idCol}
            onChange={(e) => setIdCol(e.target.value)}
            style={{ cursor: "pointer", appearance: "auto", padding: "8px" }}
          >
            <option value="">-- Выберите --</option>
            {headers?.list?.map((h, i) => (
              <option key={`${String(h)}_${i}`} value={h}>
                {h}
              </option>
            ))}
            {!headers?.list?.includes(idCol) && idCol && <option value={idCol}>{idCol}</option>}
          </select>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label className="input-label" style={{ fontSize: "13px", color: "#475569" }}>
            Номер счета / Субсчет
          </label>
          <select
            className="text-input"
            value={accCol}
            onChange={(e) => setAccCol(e.target.value)}
            style={{ cursor: "pointer", appearance: "auto", padding: "8px" }}
          >
            <option value="">-- Выберите --</option>
            {headers?.list?.map((h, i) => (
              <option key={`${String(h)}_${i}`} value={h}>
                {h}
              </option>
            ))}
            {!headers?.list?.includes(accCol) && accCol && <option value={accCol}>{accCol}</option>}
          </select>
        </div>
      </div>
    </div>
  );
};

// ------------------------------
// SverkaPage
// ------------------------------
const SverkaPage = () => {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [headers1, setHeaders1] = useState([]);
  const [headers2, setHeaders2] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("matches");

  const [filterText, setFilterText] = useState("");
  const [filterCol, setFilterCol] = useState("");

  // ✅ Admin + PODFT selection states
  const [isAdmin, setIsAdmin] = useState(false);
  const [podftSelectMode, setPodftSelectMode] = useState(false);
  const [podftSelected, setPodftSelected] = useState(() => new Set());
  const [savingPodft, setSavingPodft] = useState(false);

  const [cols, setCols] = useState({
    id_col_1: "",
    acc_col_1: "",
    id_col_2: "",
    acc_col_2: "",
  });

  const [defaults, setDefaults] = useState({
    id_unity: "Execution ID",
    acc_unity: "Account",
    id_ais: "ID сделки",
    acc_ais: "Субсчет",
  });

  // Restore last result (via API with token)
  useEffect(() => {
    const fetchLastResult = async () => {
      try {
        const { data } = await api.get("/last-result");
        if (data?.status === "success") setResults(data);
      } catch (error) {
        console.error("Ошибка восстановления:", error);
      }
    };
    fetchLastResult();
  }, []);

  // ✅ load profile (admin)
  useEffect(() => {
    api
      .get("/profile")
      .then((r) => setIsAdmin(!!r.data?.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);

  // Load settings defaults
  useEffect(() => {
    api
      .get("/settings")
      .then((res) => {
        if (res?.data) {
          setDefaults({
            id_unity: "Execution ID",
            acc_unity: res.data.default_acc_name_unity || "Account",
            id_ais: "ID сделки",
            acc_ais: res.data.default_acc_name_ais || "Субсчет",
          });
        }
      })
      .catch(() => toast.error("Сервер недоступен"));
  }, []);

  // reset filters + podft selection on tab change
  useEffect(() => {
    setFilterText("");
    setFilterCol("");
    setPodftSelectMode(false);
    setPodftSelected(new Set());
  }, [activeTab]);

  const tabs = useMemo(
    () => [
      { id: "matches", label: "Совпадения", color: "#16a34a" },
      { id: "unmatched1", label: "Расх. Unity", color: "#dc2626" },
      { id: "unmatched2", label: "Расх. АИС", color: "#dc2626" },
      { id: "podft_7m_deals", label: "ПОД/ФТ", color: "#ca8a04" },
      { id: "crypto_deals", label: "Крипто", color: "#2563eb" },
      { id: "duplicates1", label: "Дубли", color: "#ea580c" },
    ],
    []
  );

  const handleCompare = async () => {
    if (!file1 || !file2) return toast.warning("Выберите оба файла!");
    if (!cols.id_col_1 || !cols.id_col_2) return toast.warning("Выберите колонки ID!");

    setLoading(true);

    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);

    try {
      const settingsRes = await api.get("/settings");
      formData.append("settings_json", JSON.stringify(settingsRes.data));
    } catch (e) {
      setLoading(false);
      return toast.error("Ошибка настроек");
    }

    formData.append("id_col_1", cols.id_col_1);
    formData.append("acc_col_1", cols.acc_col_1);
    formData.append("id_col_2", cols.id_col_2);
    formData.append("acc_col_2", cols.acc_col_2);

    try {
      const res = await api.post("/compare", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResults(res.data);
      toast.success("Готово!");
    } catch (error) {
      toast.error("Ошибка: " + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!results?.comparison_id) {
      toast.error("Нет данных для экспорта. Повторите сверку.");
      return;
    }

    setLoadingExport(true);
    try {
      const res = await api.get(`/export/${results.comparison_id}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Report_${new Date().toLocaleDateString()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Ошибка экспорта");
    } finally {
      setLoadingExport(false);
    }
  };

  const ResultTable = ({ data }) => {
    if (!data || data.length === 0) {
      return (
        <div
          style={{
            padding: "60px",
            textAlign: "center",
            color: "#94a3b8",
            background: "#f8fafc",
            borderRadius: "12px",
          }}
        >
          <FileText size={64} style={{ opacity: 0.3, marginBottom: "20px" }} />
          <p style={{ fontSize: "18px", fontWeight: 500 }}>В этой категории данных нет</p>
        </div>
      );
    }

    const headers = Object.keys(data[0] || {});
    const normalizedQuery = (filterText || "").trim().toLowerCase();

    const filtered = !normalizedQuery
      ? data
      : data.filter((row) => {
          if (filterCol) {
            const v = row?.[filterCol];
            return String(v ?? "").toLowerCase().includes(normalizedQuery);
          }
          return headers.some((h) => String(row?.[h] ?? "").toLowerCase().includes(normalizedQuery));
        });

    const isPodftTab = activeTab === "podft_7m_deals";

    const toggleRow = (row) => {
      const key = podftRowKey(row);
      setPodftSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    const toggleAllFiltered = (checked) => {
      if (!isPodftTab) return;
      setPodftSelected((prev) => {
        const next = new Set(prev);
        if (checked) {
          filtered.forEach((r) => next.add(podftRowKey(r)));
        } else {
          filtered.forEach((r) => next.delete(podftRowKey(r)));
        }
        return next;
      });
    };

    const allChecked =
      isPodftTab &&
      podftSelectMode &&
      filtered.length > 0 &&
      filtered.every((r) => podftSelected.has(podftRowKey(r)));

    return (
      <div
        className="result-table-wrapper"
        style={{
          height: "100%",
          overflow: "auto",
          border: "none",
        }}
      >
        <table className="styled-table">
          <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
            <tr>
              {isPodftTab && podftSelectMode && (
                <th style={{ width: 46, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!allChecked}
                    onChange={(e) => toggleAllFiltered(e.target.checked)}
                    title="Выбрать все (по текущему фильтру)"
                  />
                </th>
              )}
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 2000).map((row, i) => {
              const key = isPodftTab ? podftRowKey(row) : String(i);
              const checked = isPodftTab && podftSelected.has(key);

              return (
                <tr
                  key={key}
                  style={{
                    background: checked ? "#fff7ed" : undefined,
                  }}
                >
                  {isPodftTab && podftSelectMode && (
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(row)} />
                    </td>
                  )}

                  {headers.map((h) => (
                    <td key={`${key}_${h}`}>{String(row?.[h] === null ? "" : row?.[h] ?? "")}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length > 2000 && (
          <div style={{ padding: "10px", fontSize: 12, color: "#64748b" }}>
            Показаны первые 2000 строк из {filtered.length}. Уточните фильтр.
          </div>
        )}
      </div>
    );
  };

  const showPodftToolbar = isAdmin && activeTab === "podft_7m_deals";

  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 40px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spin-anim { animation: spin 1s linear infinite; }
      `}</style>

      {/* Верх */}
      <div style={{ flexShrink: 0, overflowY: "auto", paddingBottom: "20px" }}>
        <h1 style={{ marginBottom: "20px", fontSize: "28px", color: "#1e293b" }}>Сверка данных</h1>

        <div
          className="card"
          style={{
            padding: "30px",
            border: "none",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
            <FileSection
              title="Unity"
              color="#3b82f6"
              file={file1}
              setFile={setFile1}
              headers={{ list: headers1, onLoad: setHeaders1 }}
              idCol={cols.id_col_1}
              setIdCol={(val) => setCols((prev) => ({ ...prev, id_col_1: val }))}
              accCol={cols.acc_col_1}
              setAccCol={(val) => setCols((prev) => ({ ...prev, acc_col_1: val }))}
              defaultIdName={defaults.id_unity}
              defaultAccName={defaults.acc_unity}
            />

            <div style={{ width: "1px", background: "#e2e8f0", margin: "10px 0" }} />

            <FileSection
              title="АИС"
              color="#8b5cf6"
              file={file2}
              setFile={setFile2}
              headers={{ list: headers2, onLoad: setHeaders2 }}
              idCol={cols.id_col_2}
              setIdCol={(val) => setCols((prev) => ({ ...prev, id_col_2: val }))}
              accCol={cols.acc_col_2}
              setAccCol={(val) => setCols((prev) => ({ ...prev, acc_col_2: val }))}
              defaultIdName={defaults.id_ais}
              defaultAccName={defaults.acc_ais}
            />
          </div>

          <div style={{ marginTop: "30px", display: "flex", justifyContent: "center" }}>
            <button
              className="btn"
              onClick={handleCompare}
              disabled={loading}
              style={{
                padding: "16px 60px",
                fontSize: "18px",
                fontWeight: 600,
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: loading ? "#94a3b8" : "#3b82f6",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                "Обработка..."
              ) : (
                <>
                  <Play size={24} fill="white" /> Запустить сверку
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Результаты */}
      {results && (
        <div
          className="card"
          style={{
            padding: "0",
            border: "none",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            marginBottom: "0",
          }}
        >
          <div
            style={{
              padding: "15px 30px",
              background: "white",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
              gap: "12px",
            }}
          >
            <div className="tabs-container" style={{ marginBottom: 0, borderBottom: "none" }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                  style={{ fontSize: "14px", padding: "8px 12px" }}
                >
                  {tab.label}
                  <span
                    style={{
                      background: activeTab === tab.id ? tab.color : "#f1f5f9",
                      color: activeTab === tab.id ? "white" : "#64748b",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      marginLeft: "8px",
                      fontWeight: 600,
                    }}
                  >
                    {results?.[tab.id]?.length || 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Search / Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b" }}>
                <Search size={16} />
              </div>

              <select
                value={filterCol}
                onChange={(e) => setFilterCol(e.target.value)}
                className="text-input"
                style={{ height: 38, padding: "6px 10px", borderRadius: 8, width: 220 }}
              >
                <option value="">Все колонки</option>
                {results?.[activeTab]?.[0] &&
                  Object.keys(results[activeTab][0]).map((h) => (
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
              />
            </div>

            {/* ✅ PODFT toolbar (admin only) */}
            {showPodftToolbar && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setPodftSelectMode((v) => !v);
                    setPodftSelected(new Set());
                  }}
                  style={{
                    background: podftSelectMode ? "#fff7ed" : "white",
                    color: "#92400e",
                    border: "1px solid #fdba74",
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {podftSelectMode ? "Режим выбора: ON" : "Выбрать сделки"}
                </button>

                {podftSelectMode && (
                  <>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10);
                        const rows = results?.podft_7m_deals || [];
                        const keys = rows
                          .filter(
                            (r) =>
                              parseDateToISO(r["Дата валютирования"] ?? r["value_date"] ?? r["Value date"]) === today
                          )
                          .map(podftRowKey);
                        setPodftSelected(new Set(keys));
                      }}
                      style={{
                        background: "white",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        padding: "10px 14px",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      Выбрать “сегодня”
                    </button>

                    <button
                      className="btn"
                      type="button"
                      disabled={savingPodft || podftSelected.size === 0}
                      onClick={async () => {
                        try {
                          setSavingPodft(true);
                          const snapshotDate = new Date().toISOString().slice(0, 10);

                          const selectedRows = (results?.podft_7m_deals || []).filter((r) =>
                            podftSelected.has(podftRowKey(r))
                          );

                          const trades = selectedRows
                            .map(buildPodftPayloadTrade)
                            .filter((t) => t.value_date); // отсекаем без даты

                          await api.post("/podft/snapshots", {
                            snapshot_date: snapshotDate,
                            trades,
                          });

                          toast.success(`Сохранено в Dashboard: ${trades.length}`);
                          setPodftSelectMode(false);
                          setPodftSelected(new Set());
                        } catch (e) {
                          toast.error("Ошибка сохранения POD/FT");
                        } finally {
                          setSavingPodft(false);
                        }
                      }}
                      style={{
                        background: savingPodft ? "#94a3b8" : "#f59e0b",
                        padding: "10px 14px",
                        fontSize: "14px",
                        borderRadius: "8px",
                        cursor: savingPodft ? "wait" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                      }}
                    >
                      {savingPodft ? "Сохранение..." : `Сохранить (${podftSelected.size})`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Export */}
            <button
              className="btn"
              onClick={handleExport}
              disabled={loadingExport}
              style={{
                background: loadingExport ? "#94a3b8" : "#10b981",
                padding: "10px 20px",
                fontSize: "14px",
                borderRadius: "8px",
                cursor: loadingExport ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                whiteSpace: "nowrap",
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

          <div style={{ flex: 1, background: "#ffffff", overflow: "hidden", position: "relative" }}>
            <ResultTable data={results[activeTab]} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SverkaPage;
