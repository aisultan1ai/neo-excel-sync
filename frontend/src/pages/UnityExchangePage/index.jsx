import React, { useMemo, useState } from "react";
import { api } from "../../api";
import { toast } from "react-toastify";
import { Play, Download, Loader, Settings2 } from "lucide-react";
import FileCard from "./FileCard";
import ResultTable from "./ResultTable";
import { Input, Check } from "./ui";

const UnityExchangePage = () => {
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

  const tabs = useMemo(() => [
    { id: "matches", label: "Совпадения" },
    { id: "missing", label: "Нет в Unity" },
    { id: "extra", label: "Лишнее в Unity" },
    { id: "exchange_status", label: "Статус Биржи" },
    { id: "unity_status", label: "Статус Unity" },
    { id: "volume_symbol", label: "Объем (инстр)" },
    { id: "volume_symbol_side", label: "Объем (инстр+side)" },
  ], []);

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
      const { data } = await api.post("/unity-exchange/run", fd, { headers: { "Content-Type": "multipart/form-data" } });
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
      const res = await api.get(`/unity-exchange/export/${result.run_id}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", result.report_filename || "unity_exchange_report.xlsx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Ошибка экспорта"); }
    finally { setLoadingExport(false); }
  };

  const accept = exchangeType === "BINANCE" ? ".csv,.txt,.xlsx,.xls" : exchangeType === "BYBIT" ? ".csv,.xlsx,.xls" : ".xlsx,.xls";
  const exchangeTitle = exchangeType === "BINANCE" ? "Binance (.csv/.xlsx)" : exchangeType === "BYBIT" ? "Bybit (.xlsx/.csv)" : "OKX (.xlsx)";
  const p = (key, v) => setParams((prev) => ({ ...prev, [key]: v }));

  return (
    <div style={{ width: "100%", height: "calc(100vh - 40px)", display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ margin: 0, fontSize: 24, color: "#1e293b", fontWeight: 500 }}>Unity ↔ Биржа</h1>

      <div style={{ display: "flex", gap: 10 }}>
        {["BINANCE", "OKX", "BYBIT"].map((t) => (
          <button key={t} onClick={() => { setExchangeType(t); setExchangeFile(null); setResult(null); }} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: exchangeType === t ? "#3b82f6" : "#fff", color: exchangeType === t ? "#fff" : "#334155", fontWeight: 400, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <FileCard title="Unity (.xlsx)" color="#3b82f6" file={unityFile} setFile={setUnityFile} accept=".xlsx,.xls" />
          <div style={{ width: 1, background: "#e2e8f0", margin: "10px 0" }} />
          <FileCard title={exchangeTitle} color="#8b5cf6" file={exchangeFile} setFile={setExchangeFile} accept={accept} />
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontWeight: 400, fontSize: 12 }}>
            <Settings2 size={14} /> Параметры
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <Input label="Unity UTC offset" value={params.unity_utc_offset_hours ?? ""} onChange={(v) => p("unity_utc_offset_hours", v === "" ? null : Number(v))} />
            {exchangeType === "OKX" && <Input label="OKX UTC offset (null=auto)" value={params.okx_utc_offset_hours ?? ""} onChange={(v) => p("okx_utc_offset_hours", v === "" ? null : Number(v))} />}
            {exchangeType === "BYBIT" && <Input label="Bybit UTC offset" value={params.bybit_utc_offset_hours ?? 0} onChange={(v) => p("bybit_utc_offset_hours", v === "" ? 0 : Number(v))} />}
            {exchangeType === "BINANCE" && <Input label="Binance delimiter" value={params.binance_delimiter || ";"} onChange={(v) => p("binance_delimiter", v)} />}
            <Input label="Qty decimals" value={params.qty_decimals} onChange={(v) => p("qty_decimals", Number(v))} />
            <Input label="Price decimals" value={params.price_decimals} onChange={(v) => p("price_decimals", Number(v))} />
            <Input label="Notional decimals" value={params.notional_decimals} onChange={(v) => p("notional_decimals", Number(v))} />
            <Check label="Fuzzy" checked={params.enable_fuzzy} onChange={(v) => p("enable_fuzzy", v)} />
            <Input label="Time window (sec)" value={params.time_window_seconds} onChange={(v) => p("time_window_seconds", Number(v))} />
            <Check label="Notional fallback" checked={params.enable_notional_fallback} onChange={(v) => p("enable_notional_fallback", v)} />
            <Check label="Use minute bucket" checked={params.notional_use_minute_bucket} onChange={(v) => p("notional_use_minute_bucket", v)} />
            <Check label="Export debug sheets" checked={params.export_debug_sheets} onChange={(v) => p("export_debug_sheets", v)} />
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
          <button onClick={run} disabled={loading} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: loading ? "#94a3b8" : "#3b82f6", color: "#fff", fontWeight: 400, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            {loading ? <><Loader size={18} className="spin" /> Обработка...</> : <><Play size={18} /> Запустить сверку</>}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e2e8f0", background: activeTab === t.id ? "#0f172a" : "#fff", color: activeTab === t.id ? "#fff" : "#334155", fontWeight: 400, cursor: "pointer" }}>
                {t.label} <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.85 }}>{result.preview?.[t.id]?.length ?? 0}</span>
              </button>
            ))}
            <div style={{ marginLeft: "auto" }}>
              <button onClick={exportExcel} disabled={loadingExport} style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: loadingExport ? "#94a3b8" : "#10b981", color: "#fff", fontWeight: 400, cursor: loadingExport ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                {loadingExport ? <Loader size={16} className="spin" /> : <Download size={16} />} Excel
              </button>
            </div>
          </div>

          <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
            <span style={{ fontWeight: 500 }}>{result.exchange_name}</span> rows: {result.summary.rows_exchange} | <span style={{ fontWeight: 500 }}>Unity</span> rows: {result.summary.rows_unity} | STRICT: {result.summary.matched_strict} | FUZZY: {result.summary.matched_fuzzy} | NOTIONAL: {result.summary.matched_notional} | Missing: {result.summary.missing_in_unity} | Extra: {result.summary.extra_in_unity}
            {result.summary.warning ? <span style={{ color: "#dc2626" }}> | {result.summary.warning}</span> : null}
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
            <ResultTable rows={result.preview?.[activeTab] || []} />
          </div>
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

export default UnityExchangePage;
