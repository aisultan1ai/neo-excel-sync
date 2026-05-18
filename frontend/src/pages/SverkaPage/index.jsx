import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { toast } from "react-toastify";
import { Play, Download, Loader, Search } from "lucide-react";
import FileSection from "./FileSection";
import ResultTable from "./ResultTable";
import { getLocalYMD, parseDateToISO, podftRowKey, buildPodftPayloadTrade } from "./helpers";

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [podftSelectMode, setPodftSelectMode] = useState(false);
  const [podftSelected, setPodftSelected] = useState(() => new Set());
  const [savingPodft, setSavingPodft] = useState(false);
  const [cols, setCols] = useState({ id_col_1: "", acc_col_1: "", id_col_2: "", acc_col_2: "" });
  const [defaults, setDefaults] = useState({ id_unity: "Execution ID", acc_unity: "Account", id_ais: "ID сделки", acc_ais: "Субсчет" });

  useEffect(() => {
    api.get("/last-result").then(({ data }) => { if (data?.status === "success") setResults(data); }).catch(() => {});
    api.get("/profile").then((r) => setIsAdmin(!!r.data?.is_admin)).catch(() => {});
    api.get("/settings").then((res) => {
      if (res?.data) setDefaults({ id_unity: "Execution ID", acc_unity: res.data.default_acc_name_unity || "Account", id_ais: "ID сделки", acc_ais: res.data.default_acc_name_ais || "Субсчет" });
    }).catch(() => toast.error("Сервер недоступен"));
  }, []);

  useEffect(() => {
    setFilterText(""); setFilterCol("");
    setPodftSelectMode(false); setPodftSelected(new Set());
  }, [activeTab]);

  const tabs = useMemo(() => [
    { id: "matches", label: "Совпадения", color: "#16a34a" },
    { id: "unmatched1", label: "Расх. Unity", color: "#dc2626" },
    { id: "unmatched2", label: "Расх. АИС", color: "#dc2626" },
    { id: "podft_7m_deals", label: "ПОД/ФТ", color: "#ca8a04" },
    { id: "crypto_deals", label: "Крипто", color: "#2563eb" },
    { id: "duplicates1", label: "Дубли", color: "#ea580c" },
  ], []);

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
    } catch { setLoading(false); return toast.error("Ошибка настроек"); }
    formData.append("id_col_1", cols.id_col_1);
    formData.append("acc_col_1", cols.acc_col_1);
    formData.append("id_col_2", cols.id_col_2);
    formData.append("acc_col_2", cols.acc_col_2);
    try {
      const res = await api.post("/compare", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setResults(res.data);
      toast.success("Готово!");
    } catch (error) {
      toast.error("Ошибка: " + (error.response?.data?.detail || error.message));
    } finally { setLoading(false); }
  };

  const handleExport = async () => {
    if (!results?.comparison_id) { toast.error("Нет данных для экспорта. Повторите сверку."); return; }
    setLoadingExport(true);
    try {
      const res = await api.get(`/export/${results.comparison_id}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Report_${new Date().toLocaleDateString()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Ошибка экспорта"); }
    finally { setLoadingExport(false); }
  };

  const showPodftToolbar = isAdmin && activeTab === "podft_7m_deals";

  return (
    <div style={{ width: "100%", height: "calc(100vh - 40px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .spin-anim { animation: spin 1s linear infinite; }`}</style>

      <div style={{ flexShrink: 0, overflowY: "auto", paddingBottom: "20px" }}>
        <h1 style={{ marginBottom: "20px", fontSize: "28px", color: "#1e293b" }}>Сверка данных</h1>
        <div className="card" style={{ padding: "30px", border: "none", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
            <FileSection title="Unity" color="#3b82f6" file={file1} setFile={setFile1} headers={{ list: headers1, onLoad: setHeaders1 }} idCol={cols.id_col_1} setIdCol={(val) => setCols((prev) => ({ ...prev, id_col_1: val }))} accCol={cols.acc_col_1} setAccCol={(val) => setCols((prev) => ({ ...prev, acc_col_1: val }))} defaultIdName={defaults.id_unity} defaultAccName={defaults.acc_unity} />
            <div style={{ width: "1px", background: "#e2e8f0", margin: "10px 0" }} />
            <FileSection title="АИС" color="#8b5cf6" file={file2} setFile={setFile2} headers={{ list: headers2, onLoad: setHeaders2 }} idCol={cols.id_col_2} setIdCol={(val) => setCols((prev) => ({ ...prev, id_col_2: val }))} accCol={cols.acc_col_2} setAccCol={(val) => setCols((prev) => ({ ...prev, acc_col_2: val }))} defaultIdName={defaults.id_ais} defaultAccName={defaults.acc_ais} />
          </div>
          <div style={{ marginTop: "30px", display: "flex", justifyContent: "center" }}>
            <button className="btn" onClick={handleCompare} disabled={loading} style={{ padding: "16px 60px", fontSize: "18px", fontWeight: 600, borderRadius: "12px", display: "flex", alignItems: "center", gap: "12px", background: loading ? "#94a3b8" : "#3b82f6", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Обработка..." : <><Play size={24} fill="white" /> Запустить сверку</>}
            </button>
          </div>
        </div>
      </div>

      {results && (
        <div className="card" style={{ padding: "0", border: "none", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginBottom: "0" }}>
          <div style={{ padding: "15px 30px", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: "12px" }}>
            <div className="tabs-container" style={{ marginBottom: 0, borderBottom: "none" }}>
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-btn ${activeTab === tab.id ? "active" : ""}`} style={{ fontSize: "14px", padding: "8px 12px" }}>
                  {tab.label}
                  <span style={{ background: activeTab === tab.id ? tab.color : "#f1f5f9", color: activeTab === tab.id ? "white" : "#64748b", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", marginLeft: "8px", fontWeight: 600 }}>
                    {results?.[tab.id]?.length || 0}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Search size={16} color="#64748b" />
              <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)} className="text-input" style={{ height: 38, padding: "6px 10px", borderRadius: 8, width: 220 }}>
                <option value="">Все колонки</option>
                {results?.[activeTab]?.[0] && Object.keys(results[activeTab][0]).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Фильтр/поиск..." className="text-input" style={{ height: 38, padding: "6px 10px", borderRadius: 8, width: 260 }} />
            </div>

            {showPodftToolbar && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="btn" type="button" onClick={() => { setPodftSelectMode((v) => !v); setPodftSelected(new Set()); }} style={{ background: podftSelectMode ? "#fff7ed" : "white", color: "#92400e", border: "1px solid #fdba74", padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
                  {podftSelectMode ? "Режим выбора: ON" : "Выбрать сделки"}
                </button>
                {podftSelectMode && (
                  <>
                    <button className="btn" type="button" onClick={() => {
                      const today = getLocalYMD();
                      const rows = results?.podft_7m_deals || [];
                      const keys = rows.filter((r) => parseDateToISO(r["Дата валютирования"] ?? r["value_date"] ?? r["Value date"]) === today).map(podftRowKey);
                      setPodftSelected(new Set(keys));
                    }} style={{ background: "white", color: "#334155", border: "1px solid #cbd5e1", padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
                      Выбрать "сегодня"
                    </button>
                    <button className="btn" type="button" disabled={savingPodft || podftSelected.size === 0} onClick={async () => {
                      try {
                        setSavingPodft(true);
                        const selectedRows = (results?.podft_7m_deals || []).filter((r) => podftSelected.has(podftRowKey(r)));
                        const trades = selectedRows.map(buildPodftPayloadTrade).filter((t) => t.value_date);
                        await api.post("/podft/snapshots", { snapshot_date: getLocalYMD(), trades });
                        toast.success(`Сохранено в Dashboard: ${trades.length}`);
                        setPodftSelectMode(false);
                        setPodftSelected(new Set());
                      } catch { toast.error("Ошибка сохранения POD/FT"); }
                      finally { setSavingPodft(false); }
                    }} style={{ background: savingPodft ? "#94a3b8" : "#f59e0b", padding: "10px 14px", fontSize: "14px", borderRadius: "8px", cursor: savingPodft ? "wait" : "pointer", display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap", fontWeight: 700 }}>
                      {savingPodft ? "Сохранение..." : `Сохранить (${podftSelected.size})`}
                    </button>
                  </>
                )}
              </div>
            )}

            <button className="btn" onClick={handleExport} disabled={loadingExport} style={{ background: loadingExport ? "#94a3b8" : "#10b981", padding: "10px 20px", fontSize: "14px", borderRadius: "8px", cursor: loadingExport ? "wait" : "pointer", display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
              {loadingExport ? <><Loader size={18} className="spin-anim" /> Экспорт...</> : <><Download size={18} /> Excel</>}
            </button>
          </div>

          <div style={{ flex: 1, background: "#ffffff", overflow: "hidden", position: "relative" }}>
            <ResultTable data={results[activeTab]} activeTab={activeTab} filterText={filterText} filterCol={filterCol} podftSelectMode={podftSelectMode} podftSelected={podftSelected} setPodftSelected={setPodftSelected} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SverkaPage;
