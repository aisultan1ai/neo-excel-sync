import React, { useMemo, useState } from "react";
import { api } from "../api";
import { toast } from "react-toastify";
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

const FileCard = ({ title, color, file, setFile, accept }) => {
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  return (
    <div style={{ flex: 1, minWidth: 360, display: "flex", flexDirection: "column", gap: 12 }}>
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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" }}>{title}</h3>
      </div>

      <div style={{ position: "relative", minHeight: file ? "auto" : 150 }}>
        <input
          type="file"
          onChange={pick}
          accept={accept}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 3 }}
        />

        {file ? (
          <div
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CheckCircle2 size={28} color="#16a34a" />
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            </div>

            <label
              title="Заменить файл"
              style={{
                cursor: "pointer",
                padding: 8,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#fff",
              }}
            >
              <RefreshCcw size={16} color="#64748b" />
              <input type="file" accept={accept} style={{ display: "none" }} onChange={pick} />
            </label>
          </div>
        ) : (
          <div
            style={{
              border: "1px dashed #cbd5e1",
              background: "#f8fafc",
              borderRadius: 12,
              height: 150,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <UploadCloud size={30} color="#94a3b8" />
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#3b82f6", fontWeight: 800 }}>Выберите файл</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>или перетащите сюда</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ResultTable = ({ rows }) => {
  const [filterText, setFilterText] = useState("");
  const [filterCol, setFilterCol] = useState("");

  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: 50, textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: 12 }}>
        Нет данных
      </div>
    );
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderBottom: "1px solid #e2e8f0" }}>
        <Search size={16} color="#64748b" />
        <select
          value={filterCol}
          onChange={(e) => setFilterCol(e.target.value)}
          style={{ height: 36, borderRadius: 8, border: "1px solid #e2e8f0", padding: "0 10px" }}
        >
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
          style={{ height: 36, borderRadius: 8, border: "1px solid #e2e8f0", padding: "0 10px", width: 320 }}
        />
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
          Показано: {Math.min(filtered.length, 2000)} / {filtered.length}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e2e8f0",
                    fontSize: 12,
                    color: "#475569",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 2000).map((row, i) => (
              <tr key={i}>
                {headers.map((h) => (
                  <td key={h} style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                    {String(row?.[h] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length > 2000 && (
          <div style={{ padding: 10, fontSize: 12, color: "#64748b" }}>
            Показаны первые 2000 строк. Уточните фильтр.
          </div>
        )}
      </div>
    </div>
  );
};

const UnityExchangePage = () => {
  const [exchangeType, setExchangeType] = useState("BINANCE");

  const [unityFile, setUnityFile] = useState(null);
  const [exchangeFile, setExchangeFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);

  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("matches");

  // params
  const [params, setParams] = useState({
    unity_utc_offset_hours: null,
    okx_utc_offset_hours: null,
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

  const run = async () => {
    if (!unityFile || !exchangeFile) return toast.warning("Выберите оба файла");

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("unity_file", unityFile);
      fd.append("exchange_file", exchangeFile);
      fd.append("exchange_type", exchangeType);
      fd.append("params_json", JSON.stringify(params));
      fd.append("preview_limit", "2000");

      const { data } = await api.post("/unity-exchange/run", fd, {
  headers: { "Content-Type": "multipart/form-data" },
});

      setResult(data);
      setActiveTab("matches");
      toast.success("Сверка выполнена");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

const exportExcel = async () => {
  if (!result?.run_id) return toast.error("Нет run_id для экспорта");
  setLoadingExport(true);
  try {
    const res = await api.get(`/unity-exchange/export/${result.run_id}`, {
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
};

  const accept = exchangeType === "BINANCE" ? ".csv,.txt" : ".xlsx,.xls";

  return (
    <div style={{ width: "100%", height: "calc(100vh - 40px)", display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ margin: 0, fontSize: 26, color: "#1e293b", fontWeight: 800 }}>Инструменты → Unity ↔ Биржа</h1>

      {/* exchange tabs */}
      <div style={{ display: "flex", gap: 10 }}>
        {["BINANCE", "OKX"].map((t) => (
          <button
            key={t}
            onClick={() => {
              setExchangeType(t);
              setExchangeFile(null);
              setResult(null);
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: exchangeType === t ? "#3b82f6" : "#fff",
              color: exchangeType === t ? "#fff" : "#334155",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* upload card */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <FileCard title="Unity (.xlsx)" color="#3b82f6" file={unityFile} setFile={setUnityFile} accept=".xlsx,.xls" />
          <div style={{ width: 1, background: "#e2e8f0", margin: "10px 0" }} />
          <FileCard
            title={exchangeType === "BINANCE" ? "Binance (.csv)" : "OKX (.xlsx)"}
            color="#8b5cf6"
            file={exchangeFile}
            setFile={setExchangeFile}
            accept={accept}
          />
        </div>

        {/* params */}
        <div style={{ marginTop: 16, borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontWeight: 900, fontSize: 12 }}>
            <Settings2 size={14} /> ПАРАМЕТРЫ
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <Input label="Unity UTC offset" value={params.unity_utc_offset_hours ?? ""} onChange={(v) => setParams((p) => ({ ...p, unity_utc_offset_hours: Number(v) }))} />
            {exchangeType === "OKX" && (
              <Input
                label="OKX UTC offset (null=auto)"
                value={params.okx_utc_offset_hours ?? ""}
                onChange={(v) => setParams((p) => ({ ...p, okx_utc_offset_hours: v === "" ? null : Number(v) }))}
              />
            )}
            {exchangeType === "BINANCE" && (
              <Input label="Binance delimiter" value={params.binance_delimiter || ";"} onChange={(v) => setParams((p) => ({ ...p, binance_delimiter: v }))} />
            )}
            <Input label="Qty decimals" value={params.qty_decimals} onChange={(v) => setParams((p) => ({ ...p, qty_decimals: Number(v) }))} />
            <Input label="Price decimals" value={params.price_decimals} onChange={(v) => setParams((p) => ({ ...p, price_decimals: Number(v) }))} />
            <Input label="Notional decimals" value={params.notional_decimals} onChange={(v) => setParams((p) => ({ ...p, notional_decimals: Number(v) }))} />
            <Check label="Fuzzy" checked={params.enable_fuzzy} onChange={(v) => setParams((p) => ({ ...p, enable_fuzzy: v }))} />
            <Input label="Time window (sec)" value={params.time_window_seconds} onChange={(v) => setParams((p) => ({ ...p, time_window_seconds: Number(v) }))} />
            <Check label="Notional fallback" checked={params.enable_notional_fallback} onChange={(v) => setParams((p) => ({ ...p, enable_notional_fallback: v }))} />
            <Check label="Use minute bucket" checked={params.notional_use_minute_bucket} onChange={(v) => setParams((p) => ({ ...p, notional_use_minute_bucket: v }))} />
            <Check label="Export debug sheets" checked={params.export_debug_sheets} onChange={(v) => setParams((p) => ({ ...p, export_debug_sheets: v }))} />
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
          <button
            onClick={run}
            disabled={loading}
            style={{
              padding: "14px 40px",
              borderRadius: 12,
              border: "none",
              background: loading ? "#94a3b8" : "#3b82f6",
              color: "#fff",
              fontWeight: 900,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {loading ? (
              <>
                <Loader size={18} className="spin" /> Обработка...
              </>
            ) : (
              <>
                <Play size={18} /> Запустить сверку
              </>
            )}
          </button>
        </div>
      </div>

      {/* results */}
      {result && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: activeTab === t.id ? "#0f172a" : "#fff",
                  color: activeTab === t.id ? "#fff" : "#334155",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {t.label}{" "}
                <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>
                  {(result.preview?.[t.id]?.length ?? 0)}
                </span>
              </button>
            ))}

            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={exportExcel}
                disabled={loadingExport}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: loadingExport ? "#94a3b8" : "#10b981",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: loadingExport ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {loadingExport ? <Loader size={16} className="spin" /> : <Download size={16} />}
                Excel
              </button>
            </div>
          </div>

          <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#475569" }}>
            <b>{result.exchange_name}</b> rows: {result.summary.rows_exchange} | <b>Unity</b> rows: {result.summary.rows_unity} |
            STRICT: {result.summary.matched_strict} | FUZZY: {result.summary.matched_fuzzy} | NOTIONAL:{" "}
            {result.summary.matched_notional} | Missing: {result.summary.missing_in_unity} | Extra: {result.summary.extra_in_unity}
            {result.summary.warning ? <span style={{ color: "#dc2626" }}> | {result.summary.warning}</span> : null}
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
            <ResultTable rows={result.preview?.[activeTab] || []} />
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
};

const Input = ({ label, value, onChange }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 210 }}>
    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>{label}</div>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ height: 38, borderRadius: 10, border: "1px solid #e2e8f0", padding: "0 10px" }}
    />
  </div>
);

const Check = ({ label, checked, onChange }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span style={{ fontSize: 13, fontWeight: 800, color: "#334155" }}>{label}</span>
  </label>
);

export default UnityExchangePage;