import React from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, RefreshCcw, Settings2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";

const FileSection = ({ title, file, setFile, headers, idCol, setIdCol, accCol, setAccCol, color, defaultIdName, defaultAccName }) => {
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets?.[wb.SheetNames?.[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data && data.length > 0) {
          const foundHeaders = data[0] || [];
          headers?.onLoad?.(foundHeaders);

          if (defaultIdName) {
            const foundId = foundHeaders.find((h) =>
              String(h || "").toLowerCase().trim().includes(String(defaultIdName).toLowerCase().trim())
            );
            if (foundId) setIdCol(foundId);
          }

          const foundAcc = foundHeaders.find((h) => {
            const hs = String(h || "").toLowerCase();
            return (
              (defaultAccName && hs.includes(String(defaultAccName).toLowerCase())) ||
              hs.includes("account") || hs.includes("счет") || hs.includes("субсчет") || hs.includes("subaccount")
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", minWidth: "350px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ background: color, padding: "10px", borderRadius: "10px", color: "white", boxShadow: `0 4px 10px ${color}40` }}>
          <FileSpreadsheet size={24} />
        </div>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>{title}</h3>
      </div>

      <div style={{ position: "relative", minHeight: file ? "auto" : "160px", transition: "min-height 0.3s" }}>
        <input type="file" className="file-input-hidden" style={{ zIndex: file ? 1 : 10 }} onChange={handleFileSelect} accept=".xlsx, .xls, .csv" />

        {file ? (
          <div className="uploaded-file-card" style={{ marginTop: "0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <CheckCircle2 size={32} color="#16a34a" />
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 600, fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "220px" }}>{file.name}</div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            </div>
            <label style={{ cursor: "pointer", padding: "5px", borderRadius: "50%", background: "#fff", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }} title="Заменить файл">
              <RefreshCcw size={16} color="#64748b" />
              <input type="file" style={{ display: "none" }} onChange={handleFileSelect} accept=".xlsx, .xls, .csv" />
            </label>
          </div>
        ) : (
          <div className="file-upload-area" style={{ height: "100%", position: "absolute", width: "100%", top: 0 }}>
            <UploadCloud size={32} color="#94a3b8" style={{ marginBottom: "10px" }} />
            <div style={{ textAlign: "center" }}>
              <span style={{ color: "#3b82f6", fontWeight: 600, fontSize: "16px" }}>Выберите файл</span>
              <span style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>или перетащите сюда</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: "#ffffff", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", opacity: file ? 1 : 0.6, pointerEvents: file ? "all" : "none", transition: "all 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
          <Settings2 size={14} /> ВЫБОР СТОЛБЦОВ
        </div>

        <div className="input-group" style={{ marginBottom: "10px" }}>
          <label className="input-label" style={{ fontSize: "13px", color: "#475569" }}>Уникальный ID сделки</label>
          <select className="text-input" value={idCol} onChange={(e) => setIdCol(e.target.value)} style={{ cursor: "pointer", appearance: "auto", padding: "8px" }}>
            <option value="">-- Выберите --</option>
            {headers?.list?.map((h, i) => <option key={`${String(h)}_${i}`} value={h}>{h}</option>)}
            {!headers?.list?.includes(idCol) && idCol && <option value={idCol}>{idCol}</option>}
          </select>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label className="input-label" style={{ fontSize: "13px", color: "#475569" }}>Номер счета / Субсчет</label>
          <select className="text-input" value={accCol} onChange={(e) => setAccCol(e.target.value)} style={{ cursor: "pointer", appearance: "auto", padding: "8px" }}>
            <option value="">-- Выберите --</option>
            {headers?.list?.map((h, i) => <option key={`${String(h)}_${i}`} value={h}>{h}</option>)}
            {!headers?.list?.includes(accCol) && accCol && <option value={accCol}>{accCol}</option>}
          </select>
        </div>
      </div>
    </div>
  );
};

export default FileSection;
