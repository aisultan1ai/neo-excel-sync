import React, { useMemo, useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  Play,
  Download,
  CheckCircle2,
  Loader,
  RefreshCcw,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "react-toastify";

import { api } from "../api/client";

function FileCard({ title, color, file, setFile, accept }) {
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  return (
    <div className="ue-file-card">
      <div className="ue-file-title">
        <div className="ue-file-icon" style={{ background: color }}>
          <FileSpreadsheet size={22} />
        </div>
        <h3>{title}</h3>
      </div>

      <div className="ue-file-box">
        <input
          type="file"
          onChange={pick}
          accept={accept}
          className="ue-hidden-input"
        />

        {file ? (
          <div className="ue-file-selected">
            <div className="ue-file-selected-main">
              <CheckCircle2 size={26} color="#16a34a" />
              <div>
                <div className="ue-file-name">{file.name}</div>
                <div className="ue-file-size">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            </div>

            <label className="ue-replace-btn" title="Заменить файл">
              <RefreshCcw size={16} color="#64748b" />
              <input type="file" accept={accept} hidden onChange={pick} />
            </label>
          </div>
        ) : (
          <div className="ue-file-empty">
            <UploadCloud size={30} color="#94a3b8" />
            <div>
              <div className="ue-file-empty-main">Выберите файл</div>
              <div className="ue-file-empty-sub">или перетащите сюда</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div className="ue-param-field">
      <div className="ue-param-label">{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="ue-check-field">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ResultTable({ rows }) {
  const [filterText, setFilterText] = useState("");
  const [filterCol, setFilterCol] = useState("");

  if (!rows || rows.length === 0) {
    return <div className="ue-empty-table">Нет данных</div>;
  }

  const headers = Object.keys(rows[0] || {});
  const q = (filterText || "").trim().toLowerCase();

  const filtered = !q
    ? rows
    : rows.filter((r) => {
        if (filterCol) return String(r?.[filterCol] ?? "").toLowerCase().includes(q);
        return headers.some((h) => String(r?.[h] ?? "").toLowerCase().includes(q));
      });

  return (
    <div className="ue-results-table-shell">
      <div className="ue-results-filterbar">
        <Search size={16} color="#64748b" />

        <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)}>
          <option value="">Все колонки</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Поиск..."
        />

        <div className="ue-results-count">
          Показано: {Math.min(filtered.length, 2000)} / {filtered.length}
        </div>
      </div>

      <div className="ue-results-table-wrap">
        <table className="ue-results-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
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
          <div className="ue-results-note">Показаны первые 2000 строк. Уточните фильтр.</div>
        )}
      </div>
    </div>
  );
}

export default function UnityExchangePage() {
  const [exchangeType, setExchangeType] = useState("BINANCE");

  const [unityFile, setUnityFile] = useState(null);
  const [exchangeFile, setExchangeFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);

  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("matches");

  const [params, setParams] = useState({
    unity_utc_offset_hours: null,
    okx_utc_offset_hours: null,
    bybit_utc_offset_hours: 0,
    qty_decimals: 8,
    price_decimals: 8,
    enable_fuzzy: true,
    time_window_seconds: 180,
    qty_rel_tol: 1e-6,
    qty_abs_tol: 0.0,
    price_rel_tol: 1e-6,
    price_abs_tol: 0.0,
    enable_notional_fallback: true,
    notional_decimals: 6,
    notional_use_minute_bucket: true,
    enable_volume_recon: true,
    volume_group_by_side: true,
    binance_delimiter: ";",
    export_debug_sheets: false,
  });

  const tabs = useMemo(
    () => [
      { id: "matches", label: "Совпадения" },
      { id: "missing", label: "Нет в Unity" },
      { id: "extra", label: "Лишнее в Unity" },
      { id: "exchange_status", label: "Статус Биржи" },
      { id: "unity_status", label: "Статус Unity" },
      { id: "volume_symbol", label: "Объем (инстр)" },
      { id: "volume_symbol_side", label: "Объем (инстр+side)" },
    ],
    []
  );

  async function run() {
    if (!unityFile || !exchangeFile) {
      toast.warning("Выберите оба файла");
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("unity_file", unityFile);
      fd.append("exchange_file", exchangeFile);
      fd.append("exchange_type", exchangeType);
      fd.append("params_json", JSON.stringify(params));
      fd.append("preview_limit", "2000");

      const { data } = await api.post("/api/v2/unity-exchange/run", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResult(data);
      setActiveTab("matches");
      toast.success("Сверка выполнена");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Ошибка запуска");
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    if (!result?.run_id) {
      toast.error("Нет run_id для экспорта");
      return;
    }

    setLoadingExport(true);
    try {
      const res = await api.get(`/api/v2/unity-exchange/export/${result.run_id}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", result.report_filename || "unity_exchange_report.xlsx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Ошибка экспорта");
    } finally {
      setLoadingExport(false);
    }
  }

  const accept =
    exchangeType === "BINANCE"
      ? ".csv,.txt,.xlsx,.xls"
      : exchangeType === "BYBIT"
      ? ".csv,.xlsx,.xls"
      : ".xlsx,.xls";

  const exchangeTitle =
    exchangeType === "BINANCE"
      ? "Binance (.csv/.xlsx)"
      : exchangeType === "BYBIT"
      ? "Bybit (.xlsx/.csv)"
      : "OKX (.xlsx)";

  return (
    <div className="page ue-page">
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0); } 100% { transform: rotate(360deg); } }
      `}</style>

      <h1>Unity ↔ Биржа</h1>

      <div className="ue-type-switcher">
        {["BINANCE", "OKX", "BYBIT"].map((t) => (
          <button
            key={t}
            className={`ue-type-btn ${exchangeType === t ? "active" : ""}`}
            onClick={() => {
              setExchangeType(t);
              setExchangeFile(null);
              setResult(null);
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card ue-top-card">
        <div className="ue-files-row">
          <FileCard
            title="Unity (.xlsx)"
            color="#3b82f6"
            file={unityFile}
            setFile={setUnityFile}
            accept=".xlsx,.xls"
          />

          <div className="ue-divider" />

          <FileCard
            title={exchangeTitle}
            color="#8b5cf6"
            file={exchangeFile}
            setFile={setExchangeFile}
            accept={accept}
          />
        </div>

        <div className="ue-params-wrap">
          <div className="ue-params-title">
            <Settings2 size={14} />
            <span>Параметры</span>
          </div>

          <div className="ue-params-grid">
            <Input
              label="Unity UTC offset"
              value={params.unity_utc_offset_hours ?? ""}
              onChange={(v) =>
                setParams((p) => ({
                  ...p,
                  unity_utc_offset_hours: v === "" ? null : Number(v),
                }))
              }
            />

            {exchangeType === "OKX" && (
              <Input
                label="OKX UTC offset (null=auto)"
                value={params.okx_utc_offset_hours ?? ""}
                onChange={(v) =>
                  setParams((p) => ({
                    ...p,
                    okx_utc_offset_hours: v === "" ? null : Number(v),
                  }))
                }
              />
            )}

            {exchangeType === "BYBIT" && (
              <Input
                label="Bybit UTC offset"
                value={params.bybit_utc_offset_hours ?? 0}
                onChange={(v) =>
                  setParams((p) => ({
                    ...p,
                    bybit_utc_offset_hours: v === "" ? 0 : Number(v),
                  }))
                }
              />
            )}

            {exchangeType === "BINANCE" && (
              <Input
                label="Binance delimiter"
                value={params.binance_delimiter || ";"}
                onChange={(v) => setParams((p) => ({ ...p, binance_delimiter: v }))}
              />
            )}

            <Input
              label="Qty decimals"
              value={params.qty_decimals}
              onChange={(v) => setParams((p) => ({ ...p, qty_decimals: Number(v) }))}
            />

            <Input
              label="Price decimals"
              value={params.price_decimals}
              onChange={(v) => setParams((p) => ({ ...p, price_decimals: Number(v) }))}
            />

            <Input
              label="Notional decimals"
              value={params.notional_decimals}
              onChange={(v) => setParams((p) => ({ ...p, notional_decimals: Number(v) }))}
            />

            <Input
              label="Time window (sec)"
              value={params.time_window_seconds}
              onChange={(v) => setParams((p) => ({ ...p, time_window_seconds: Number(v) }))}
            />

            <Check
              label="Fuzzy"
              checked={params.enable_fuzzy}
              onChange={(v) => setParams((p) => ({ ...p, enable_fuzzy: v }))}
            />

            <Check
              label="Notional fallback"
              checked={params.enable_notional_fallback}
              onChange={(v) => setParams((p) => ({ ...p, enable_notional_fallback: v }))}
            />

            <Check
              label="Use minute bucket"
              checked={params.notional_use_minute_bucket}
              onChange={(v) => setParams((p) => ({ ...p, notional_use_minute_bucket: v }))}
            />

            <Check
              label="Export debug sheets"
              checked={params.export_debug_sheets}
              onChange={(v) => setParams((p) => ({ ...p, export_debug_sheets: v }))}
            />
          </div>
        </div>

        <div className="ue-run-row">
          <button className="ue-run-btn" onClick={run} disabled={loading}>
            {loading ? (
              <>
                <Loader size={18} className="spin" />
                <span>Обработка...</span>
              </>
            ) : (
              <>
                <Play size={18} />
                <span>Запустить сверку</span>
              </>
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className="card ue-results-card">
          <div className="ue-results-toolbar">
            <div className="ue-tabs">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={`ue-tab-btn ${activeTab === t.id ? "active" : ""}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  <span>{t.label}</span>
                  <span className="ue-tab-count">
                    {result.preview?.[t.id]?.length ?? 0}
                  </span>
                </button>
              ))}
            </div>

            <button className="save-btn" onClick={exportExcel} disabled={loadingExport}>
              {loadingExport ? (
                <>
                  <Loader size={16} className="spin" />
                  <span>Экспорт...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Excel</span>
                </>
              )}
            </button>
          </div>

          <div className="ue-summary-bar">
            <span><b>{result.exchange_name}</b> rows: {result.summary.rows_exchange}</span>
            <span><b>Unity</b> rows: {result.summary.rows_unity}</span>
            <span>STRICT: {result.summary.matched_strict}</span>
            <span>FUZZY: {result.summary.matched_fuzzy}</span>
            <span>NOTIONAL: {result.summary.matched_notional}</span>
            <span>Missing: {result.summary.missing_in_unity}</span>
            <span>Extra: {result.summary.extra_in_unity}</span>
            {result.summary.warning ? <span className="ue-warning">{result.summary.warning}</span> : null}
          </div>

          <div className="ue-results-body">
            <ResultTable rows={result.preview?.[activeTab] || []} />
          </div>
        </div>
      )}
    </div>
  );
}