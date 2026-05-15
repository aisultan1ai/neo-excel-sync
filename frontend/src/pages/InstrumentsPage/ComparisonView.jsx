import React, { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { ArrowRightLeft, List, Loader2, Play } from "lucide-react";
import { api } from "../../api";
import { SimpleFileBlock, TabButton } from "./ui";

const ComparisonView = () => {
  const [file1, setFile1] = useState(null);
  const [headers1, setHeaders1] = useState([]);
  const [col1, setCol1] = useState("");

  const [file2, setFile2] = useState(null);
  const [headers2, setHeaders2] = useState([]);
  const [col2, setCol2] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("missing2");

  const handleCompare = async () => {
    if (!file1 || !file2 || !col1 || !col2)
      return toast.warning("Пожалуйста, загрузите оба файла и выберите колонки.");

    setLoading(true);
    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("col1", col1);
    formData.append("col2", col2);

    try {
      const res = await api.post("/compare-instruments", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(res.data);
      toast.success("Сверка завершена успешно!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Ошибка при сверке. Проверьте файлы.");
    } finally {
      setLoading(false);
    }
  };

  const getTabData = useCallback(() => {
    if (!result?.data) return [];
    if (activeTab === "missing2") return result.data.only_in_unity || [];
    if (activeTab === "missing1") return result.data.only_in_ais || [];
    return result.data.matches || [];
  }, [result, activeTab]);

  const data = getTabData();
  const isObjectRows = Array.isArray(data) && data.length > 0 && typeof data[0] === "object";

  const thStyle = { padding: "15px 24px", textAlign: "left", color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" };
  const tdMuted = { padding: "12px 24px", width: "60px", color: "#94a3b8", fontSize: "13px" };
  const tdMain = { padding: "12px 24px", fontWeight: 500, color: "#334155" };
  const tdNum = { padding: "12px 24px", color: "#0f172a", fontWeight: 700, whiteSpace: "nowrap" };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "25px", flexShrink: 0 }}>
        <SimpleFileBlock title="Unity" description="Основной справочник" color="#3b82f6"
          file={file1} setFile={setFile1} headers={headers1} setHeaders={setHeaders1} selectedCol={col1} setSelectedCol={setCol1} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "50%", color: "#94a3b8" }}>
            <ArrowRightLeft size={24} />
          </div>
        </div>

        <SimpleFileBlock title="Провайдер" description="Внешний файл для сверки" color="#8b5cf6"
          file={file2} setFile={setFile2} headers={headers2} setHeaders={setHeaders2} selectedCol={col2} setSelectedCol={setCol2} />
      </div>

      <div style={{ textAlign: "center", marginBottom: "30px", flexShrink: 0 }}>
        <button
          className="custom-btn" onClick={handleCompare} disabled={loading}
          style={{ padding: "14px 40px", fontSize: "16px", fontWeight: 600, background: loading ? "#94a3b8" : "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "white", border: "none", borderRadius: "50px", boxShadow: "0 4px 6px -1px rgba(16,185,129,0.3)", cursor: loading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "10px" }}
        >
          {loading ? <Loader2 className="spin" size={20} /> : <Play size={20} fill="currentColor" />}
          {loading ? "Обработка данных..." : "Начать сверку"}
        </button>
      </div>

      {result && (
        <div className="card fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", background: "white", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", padding: "0 10px" }}>
            <TabButton active={activeTab === "missing2"} onClick={() => setActiveTab("missing2")} color="#ef4444" label="Только в Unity" count={result?.stats?.only_in_1 ?? 0} />
            <TabButton active={activeTab === "missing1"} onClick={() => setActiveTab("missing1")} color="#f59e0b" label="Только у Провайдера" count={result?.stats?.only_in_2 ?? 0} />
            <TabButton active={activeTab === "matches"} onClick={() => setActiveTab("matches")} color="#16a34a" label="Совпадения" count={result?.stats?.matches ?? 0} />
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f1f5f9", position: "sticky", top: 0, zIndex: 10 }}>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Инструмент (Тикер)</th>
                  {isObjectRows && activeTab === "matches" && <><th style={thStyle}>Unity (count)</th><th style={thStyle}>Provider (count)</th><th style={thStyle}>Diff</th></>}
                  {isObjectRows && activeTab === "missing2" && <th style={thStyle}>Unity (count)</th>}
                  {isObjectRows && activeTab === "missing1" && <th style={thStyle}>Provider (count)</th>}
                </tr>
              </thead>
              <tbody>
                {(!data || data.length === 0) ? (
                  <tr>
                    <td colSpan={isObjectRows ? (activeTab === "matches" ? 5 : 3) : 2} style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>
                      <List size={48} style={{ opacity: 0.2, marginBottom: 15 }} />
                      <div style={{ fontSize: "16px" }}>Список пуст</div>
                    </td>
                  </tr>
                ) : data.map((row, idx) => {
                  const instrument = isObjectRows ? (row.instrument ?? row) : row;
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={tdMuted}>{idx + 1}</td>
                      <td style={tdMain}>{instrument}</td>
                      {isObjectRows && activeTab === "matches" && <><td style={tdNum}>{row.count_file1 ?? 0}</td><td style={tdNum}>{row.count_file2 ?? 0}</td><td style={tdNum}>{row.diff ?? 0}</td></>}
                      {isObjectRows && activeTab === "missing2" && <td style={tdNum}>{row.count_file1 ?? 0}</td>}
                      {isObjectRows && activeTab === "missing1" && <td style={tdNum}>{row.count_file2 ?? 0}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonView;
