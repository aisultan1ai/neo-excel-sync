import React, { useState } from "react";
import axios from "axios";
import { Layers, AlertCircle, Upload, FileSpreadsheet, X } from "lucide-react";
import { toast } from "react-toastify";
import ResultCard from "./ResultCard";
import ReferenceManager from "./ReferenceManager";

const SplitsPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCheck = async () => {
    if (!file) { toast.error("Пожалуйста, выберите файл для проверки."); return; }
    setLoading(true);
    setResult(null);
    setError(null);
    const formData = new FormData();
    formData.append("daily_file", file);
    try {
      const settingsRes = await axios.get("/api/v1/settings");
      formData.append("settings_json", JSON.stringify(settingsRes.data));
      const res = await axios.post("/api/v1/check-splits", formData, { headers: { "Content-Type": "multipart/form-data" } });
      if (res.data.status === "error") setError(res.data.message);
      else { setResult(res.data); toast.success("Проверка завершена"); }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const clearFile = (e) => { e.stopPropagation(); setFile(null); setResult(null); };

  return (
    <div style={{ width: "100%", paddingRight: "20px", paddingBottom: "50px" }}>
      <h1 style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>Проверка Сплитов</h1>

      <div className="card" style={{ padding: "30px" }}>
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
            <Layers size={24} color="#3b82f6" /> Шаг 1. Загрузка ежедневного отчета (АИС)
          </h3>
          <p style={{ margin: "5px 0 0 0", fontSize: "14px", color: "#64748b" }}>Загрузите файл для проверки. Он будет сверен с текущим справочником.</p>
        </div>

        <div
          style={{ border: "2px dashed #cbd5e1", borderRadius: "12px", padding: "40px 20px", textAlign: "center", cursor: "pointer", backgroundColor: file ? "#f0f9ff" : "#f8fafc", transition: "all 0.2s ease", position: "relative" }}
          onClick={() => document.getElementById("split-file-upload").click()}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
        >
          <input id="split-file-upload" type="file" accept=".xlsx, .xls" hidden onChange={(e) => setFile(e.target.files[0])} />
          {!file ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "#e0f2fe", padding: "15px", borderRadius: "50%" }}><Upload size={30} color="#3b82f6" /></div>
              <div>
                <span style={{ color: "#3b82f6", fontWeight: 600 }}>Нажмите, чтобы загрузить</span><br />
                <span style={{ fontSize: "13px", color: "#94a3b8" }}>или перетащите файл сюда</span>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "15px" }}>
              <FileSpreadsheet size={40} color="#10b981" />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{file.name}</div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <button onClick={clearFile} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "50%", width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginLeft: "20px" }}>
                <X size={16} color="#ef4444" />
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={handleCheck} disabled={loading || !file} style={{ height: "45px", padding: "0 30px", opacity: !file || loading ? 0.6 : 1 }}>
            {loading ? "Анализ..." : "Проверить файл"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: "5px solid #ef4444", backgroundColor: "#fef2f2", marginTop: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#b91c1c" }}>
            <AlertCircle /> <h3>Ошибка</h3>
          </div>
          <p style={{ margin: "10px 0" }}>{error}</p>
        </div>
      )}

      <ResultCard result={result} />
      <ReferenceManager />
    </div>
  );
};

export default SplitsPage;
