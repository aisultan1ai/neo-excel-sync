import React, { useEffect, useMemo, useState } from "react";
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
import { toast } from "react-toastify";

import { api } from "../api/client";

const parseDateToISO = (v) => {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();

  if (typeof v === "number" && Number.isFinite(v)) {
    const dt = XLSX.SSF.parse_date_code(v);
    if (!dt) return "";
    const mm = String(dt.m).padStart(2, "0");
    const dd = String(dt.d).padStart(2, "0");
    return `${dt.y}-${mm}-${dd}`;
  }

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

const getLocalYMD = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const podftRowKey = (r) => {
  const dt = parseDateToISO(r?.["Дата валютирования"] ?? r?.["value_date"] ?? r?.["Value date"]);
  const acct = String(r?.["Субсчет"] ?? r?.["Account"] ?? r?.["account"] ?? "").trim();
  const instr = String(r?.["Instrument"] ?? r?.["инструмент"] ?? r?.["instrument"] ?? "").trim();
  const amt = String(r?.["Сумма тг"] ?? r?.["amount_tg"] ?? r?.["Amount tg"] ?? "").trim();
  const side = String(r?.["Side"] ?? r?.["side"] ?? "").trim();
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
    raw: r,
  };
};

function FileSection({
  title,
  file,
  setFile,
  headers,
  onHeadersLoad,
  idCol,
  setIdCol,
  accCol,
  setAccCol,
  color,
  defaultIdName,
  defaultAccName,
}) {
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
          onHeadersLoad(foundHeaders);

          if (defaultIdName) {
            const foundId = foundHeaders.find((h) =>
              String(h || "")
                .toLowerCase()
                .trim()
                .includes(String(defaultIdName).toLowerCase().trim())
            );
            if (foundId) setIdCol(foundId);
          }

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
        console.error(err);
        toast.error("Не удалось прочитать заголовки файла");
      }
    };

    reader.readAsBinaryString(selectedFile);
  };

  return (
    <div className="compare-file-section">
      <div className="compare-file-title">
        <div className="compare-file-icon" style={{ background: color }}>
          <FileSpreadsheet size={22} />
        </div>
        <h3>{title}</h3>
      </div>

      <div className="compare-upload-wrap">
        <input
          type="file"
          className="compare-hidden-input"
          onChange={handleFileSelect}
          accept=".xlsx,.xls,.csv"
        />

        {file ? (
          <div className="compare-uploaded-file">
            <div className="compare-uploaded-main">
              <CheckCircle2 size={28} color="#16a34a" />
              <div className="compare-uploaded-meta">
                <div className="compare-uploaded-name">{file.name}</div>
                <div className="compare-uploaded-size">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            </div>

            <label className="compare-replace-btn" title="Заменить файл">
              <RefreshCcw size={16} />
              <input
                type="file"
                hidden
                onChange={handleFileSelect}
                accept=".xlsx,.xls,.csv"
              />
            </label>
          </div>
        ) : (
          <div className="compare-upload-area">
            <UploadCloud size={32} color="#94a3b8" />
            <div className="compare-upload-text">
              <span>Выберите файл</span>
              <small>или перетащите сюда</small>
            </div>
          </div>
        )}
      </div>

      <div className={`compare-column-box ${file ? "" : "disabled"}`}>
        <div className="compare-column-box-title">
          <Settings2 size={14} />
          <span>ВЫБОР СТОЛБЦОВ</span>
        </div>

        <div className="form-group">
          <label>Уникальный ID сделки</label>
          <select value={idCol} onChange={(e) => setIdCol(e.target.value)}>
            <option value="">-- Выберите --</option>
            {headers.map((h, i) => (
              <option key={`${String(h)}_${i}`} value={h}>
                {h}
              </option>
            ))}
            {!headers.includes(idCol) && idCol && <option value={idCol}>{idCol}</option>}
          </select>
        </div>

        <div className="form-group">
          <label>Номер счета / Субсчет</label>
          <select value={accCol} onChange={(e) => setAccCol(e.target.value)}>
            <option value="">-- Выберите --</option>
            {headers.map((h, i) => (
              <option key={`${String(h)}_${i}`} value={h}>
                {h}
              </option>
            ))}
            {!headers.includes(accCol) && accCol && <option value={accCol}>{accCol}</option>}
          </select>
        </div>
      </div>
    </div>
  );
}

function ResultTable({
  data,
  activeTab,
  filterText,
  filterCol,
  podftSelectMode,
  podftSelected,
  setPodftSelected,
}) {
  if (!data || data.length === 0) {
    return (
      <div className="compare-empty-state">
        <FileText size={64} />
        <p>В этой категории данных нет</p>
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

        return headers.some((h) =>
          String(row?.[h] ?? "").toLowerCase().includes(normalizedQuery)
        );
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
      if (checked) filtered.forEach((r) => next.add(podftRowKey(r)));
      else filtered.forEach((r) => next.delete(podftRowKey(r)));
      return next;
    });
  };

  const allChecked =
    isPodftTab &&
    podftSelectMode &&
    filtered.length > 0 &&
    filtered.every((r) => podftSelected.has(podftRowKey(r)));

  return (
    <div className="compare-table-wrap">
      <table className="compare-table">
        <thead>
          <tr>
            {isPodftTab && podftSelectMode && (
              <th style={{ width: 46, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={!!allChecked}
                  onChange={(e) => toggleAllFiltered(e.target.checked)}
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
              <tr key={key} style={{ background: checked ? "#fff7ed" : undefined }}>
                {isPodftTab && podftSelectMode && (
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRow(row)}
                    />
                  </td>
                )}

                {headers.map((h) => (
                  <td key={`${key}_${h}`}>
                    {String(row?.[h] === null ? "" : row?.[h] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {filtered.length > 2000 && (
        <div className="compare-table-note">
          Показаны первые 2000 строк из {filtered.length}. Уточните фильтр.
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
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

  useEffect(() => {
    async function restoreLastResult() {
      try {
        const { data } = await api.get("/api/v2/compare/last-result");
        if (data?.status === "success") setResults(data);
      } catch (error) {
        console.error("Ошибка восстановления:", error);
      }
    }

    restoreLastResult();
  }, []);

  useEffect(() => {
    api
      .get("/api/v2/profile")
      .then((res) => setIsAdmin(!!res.data?.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    api
      .get("/api/v2/settings")
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
      { id: "duplicates1", label: "Дубли Unity", color: "#ea580c" },
      { id: "duplicates2", label: "Дубли АИС", color: "#ea580c" },
    ],
    []
  );

  async function handleCompare() {
    if (!file1 || !file2) {
      toast.warning("Выберите оба файла");
      return;
    }

    if (!cols.id_col_1 || !cols.id_col_2) {
      toast.warning("Выберите колонки ID");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);

    try {
      const settingsRes = await api.get("/api/v2/settings");
      formData.append("settings_json", JSON.stringify(settingsRes.data));
    } catch (e) {
      setLoading(false);
      toast.error("Ошибка загрузки настроек");
      return;
    }

    formData.append("id_col_1", cols.id_col_1);
    formData.append("acc_col_1", cols.acc_col_1);
    formData.append("id_col_2", cols.id_col_2);
    formData.append("acc_col_2", cols.acc_col_2);

    try {
      const res = await api.post("/api/v2/compare", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResults(res.data);
      setActiveTab("matches");
      toast.success("Сверка выполнена");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка сверки");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!results?.comparison_id) {
      toast.error("Нет данных для экспорта. Повторите сверку.");
      return;
    }

    setLoadingExport(true);
    try {
      const res = await api.get(`/api/v2/compare/export/${results.comparison_id}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Report_${new Date().toLocaleDateString().replaceAll(".", "_")}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Ошибка экспорта");
    } finally {
      setLoadingExport(false);
    }
  }

  const showPodftToolbar = isAdmin && activeTab === "podft_7m_deals";

  return (
    <div className="page compare-page">
      <h1>Сверка данных</h1>

      <div className="card compare-top-card">
        <div className="compare-files-row">
          <FileSection
            title="Unity"
            color="#3b82f6"
            file={file1}
            setFile={setFile1}
            headers={headers1}
            onHeadersLoad={setHeaders1}
            idCol={cols.id_col_1}
            setIdCol={(val) => setCols((prev) => ({ ...prev, id_col_1: val }))}
            accCol={cols.acc_col_1}
            setAccCol={(val) => setCols((prev) => ({ ...prev, acc_col_1: val }))}
            defaultIdName={defaults.id_unity}
            defaultAccName={defaults.acc_unity}
          />

          <div className="compare-divider" />

          <FileSection
            title="АИС"
            color="#8b5cf6"
            file={file2}
            setFile={setFile2}
            headers={headers2}
            onHeadersLoad={setHeaders2}
            idCol={cols.id_col_2}
            setIdCol={(val) => setCols((prev) => ({ ...prev, id_col_2: val }))}
            accCol={cols.acc_col_2}
            setAccCol={(val) => setCols((prev) => ({ ...prev, acc_col_2: val }))}
            defaultIdName={defaults.id_ais}
            defaultAccName={defaults.acc_ais}
          />
        </div>

        <div className="compare-run-row">
          <button className="compare-run-btn" onClick={handleCompare} disabled={loading}>
            {loading ? (
              <>
                <Loader size={22} className="spin-anim" />
                <span>Обработка...</span>
              </>
            ) : (
              <>
                <Play size={22} />
                <span>Запустить сверку</span>
              </>
            )}
          </button>
        </div>
      </div>

      {results && (
        <div className="card compare-results-card">
          <div className="compare-results-toolbar">
            <div className="compare-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`compare-tab ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  <span
                    className="compare-tab-count"
                    style={{
                      background: activeTab === tab.id ? tab.color : "#f1f5f9",
                      color: activeTab === tab.id ? "white" : "#64748b",
                    }}
                  >
                    {results?.[tab.id]?.length || 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="compare-filter-row">
              <Search size={16} color="#64748b" />

              <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)}>
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
                placeholder="Фильтр / поиск..."
              />
            </div>

            {showPodftToolbar && (
              <div className="compare-podft-toolbar">
                <button
                  className="secondary-btn"
                  onClick={() => {
                    setPodftSelectMode((v) => !v);
                    setPodftSelected(new Set());
                  }}
                >
                  {podftSelectMode ? "Режим выбора: ON" : "Выбрать сделки"}
                </button>

                {podftSelectMode && (
                  <>
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        const today = getLocalYMD();
                        const rows = results?.podft_7m_deals || [];
                        const keys = rows
                          .filter(
                            (r) =>
                              parseDateToISO(
                                r["Дата валютирования"] ?? r["value_date"] ?? r["Value date"]
                              ) === today
                          )
                          .map(podftRowKey);

                        setPodftSelected(new Set(keys));
                      }}
                    >
                      Выбрать “сегодня”
                    </button>

                    <button
                      className="save-btn"
                      disabled={savingPodft || podftSelected.size === 0}
                      onClick={async () => {
                        try {
                          setSavingPodft(true);

                          const snapshotDate = getLocalYMD();
                          const selectedRows = (results?.podft_7m_deals || []).filter((r) =>
                            podftSelected.has(podftRowKey(r))
                          );

                          const trades = selectedRows
                            .map(buildPodftPayloadTrade)
                            .filter((t) => t.value_date);

                          await api.post("/api/v2/podft/snapshots", {
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
                    >
                      {savingPodft ? "Сохранение..." : `Сохранить (${podftSelected.size})`}
                    </button>
                  </>
                )}
              </div>
            )}

            <button className="save-btn" onClick={handleExport} disabled={loadingExport}>
              {loadingExport ? (
                <>
                  <Loader size={18} className="spin-anim" />
                  <span>Экспорт...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Excel</span>
                </>
              )}
            </button>
          </div>

          <div className="compare-results-table-area">
            <ResultTable
              data={results[activeTab]}
              activeTab={activeTab}
              filterText={filterText}
              filterCol={filterCol}
              podftSelectMode={podftSelectMode}
              podftSelected={podftSelected}
              setPodftSelected={setPodftSelected}
            />
          </div>
        </div>
      )}
    </div>
  );
}