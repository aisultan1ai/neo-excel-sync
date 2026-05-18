import React, { useState } from "react";
import axios from "axios";
import { Database, Eye, EyeOff, FileUp, Save, X, Search } from "lucide-react";
import { toast } from "react-toastify";

const ReferenceManager = () => {
  const [refFile, setRefFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const handleUpload = async () => {
    if (!refFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", refFile);
    try {
      await axios.post("/api/v1/settings/upload-split-list", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setRefFile(null);
      toast.success("Справочник сплитов успешно обновлен!");
      if (showTable) handleView(true);
    } catch (err) {
      console.error(err);
      toast.error("Ошибка загрузки справочника");
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (forceUpdate = false) => {
    if (showTable && viewData && !forceUpdate) { setShowTable(false); return; }
    setLoadingView(true);
    try {
      const res = await axios.get("/api/v1/settings/split-list-content");
      if (res.data.status === "empty") { toast.info(res.data.message); }
      else { setViewData(res.data.data); setShowTable(true); }
    } catch (err) {
      console.error(err);
      toast.error("Не удалось загрузить данные справочника");
    } finally {
      setLoadingView(false);
    }
  };

  const filteredData = viewData
    ? viewData.filter((row) => !searchTerm || Object.values(row).some((val) => String(val).toLowerCase().includes(searchTerm.toLowerCase())))
    : [];

  return (
    <div style={{ marginTop: "40px", borderTop: "1px solid #e2e8f0", paddingTop: "30px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px", color: "#475569" }}>
        <Database size={24} /> Управление справочником (База сплитов)
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
        <div className="card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h4 style={{ marginTop: 0, marginBottom: "5px" }}>Обновить базу</h4>
          <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "15px" }}>Загрузите Excel-файл, чтобы заменить текущий список сплитов.</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input id="ref-upload" type="file" accept=".xlsx, .xls" style={{ display: "none" }} onChange={(e) => setRefFile(e.target.files[0])} />
            {!refFile ? (
              <button className="btn" style={{ background: "white", color: "#334155", border: "1px solid #cbd5e1" }} onClick={() => document.getElementById("ref-upload").click()}>
                <FileUp size={16} style={{ marginRight: "8px" }} /> Выбрать файл...
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
                <div style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  📄 {refFile.name}
                </div>
                <button className="btn" disabled={uploading} onClick={handleUpload} style={{ padding: "8px 15px", height: "auto", display: "flex", gap: "5px", background: "#10b981", border: "none" }}>
                  <Save size={16} /> {uploading ? "..." : "Сохранить"}
                </button>
                <button onClick={() => setRefFile(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#ef4444" }}>
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start" }}>
          <h4 style={{ marginTop: 0, marginBottom: "5px" }}>Просмотр базы</h4>
          <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "15px" }}>Открыть таблицу текущих сплитов для проверки данных.</p>
          <button className="btn" onClick={() => handleView()} style={{ background: showTable ? "#e2e8f0" : "white", color: "#334155", border: "1px solid #cbd5e1", display: "flex", gap: "8px" }}>
            {showTable ? <EyeOff size={18} /> : <Eye size={18} />}
            {loadingView ? "Загрузка..." : showTable ? "Скрыть таблицу" : "Открыть таблицу"}
          </button>
        </div>
      </div>

      {showTable && viewData && (
        <div className="card" style={{ marginTop: "20px", overflow: "hidden", padding: 0 }}>
          <div style={{ padding: "15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
            <div style={{ fontWeight: 600, color: "#334155" }}>
              Записей: {filteredData.length} <span style={{ color: "#94a3b8", fontWeight: 400 }}>(всего {viewData.length})</span>
            </div>
            <div style={{ position: "relative", width: "250px" }}>
              <Search size={16} style={{ position: "absolute", left: "10px", top: "9px", color: "#94a3b8" }} />
              <input type="text" placeholder="Поиск по справочнику..." className="text-input" style={{ marginBottom: 0, paddingLeft: "35px", height: "34px", fontSize: "13px" }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div style={{ overflowX: "auto", maxHeight: "500px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left", position: "sticky", top: 0, zIndex: 10 }}>
                  {viewData.length > 0 && Object.keys(viewData[0]).map((key) => (
                    <th key={key} style={{ padding: "12px 15px", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.length > 0 ? (
                  filteredData.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {Object.values(row).map((val, i) => <td key={i} style={{ padding: "10px 15px" }}>{val}</td>)}
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="100%" style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>Ничего не найдено</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferenceManager;
