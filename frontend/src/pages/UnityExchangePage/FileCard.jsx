import React from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, RefreshCcw } from "lucide-react";

const FileCard = ({ title, color, file, setFile, accept }) => {
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  return (
    <div style={{ flex: 1, minWidth: 360, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: color, padding: 10, borderRadius: 10, color: "white", boxShadow: `0 4px 10px ${color}40` }}>
          <FileSpreadsheet size={24} />
        </div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "#1e293b" }}>{title}</h3>
      </div>

      <div style={{ position: "relative", minHeight: file ? "auto" : 150 }}>
        <input type="file" onChange={pick} accept={accept} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 3 }} />

        {file ? (
          <div style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CheckCircle2 size={26} color="#16a34a" />
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            </div>
            <label title="Заменить файл" style={{ cursor: "pointer", padding: 8, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
              <RefreshCcw size={16} color="#64748b" />
              <input type="file" accept={accept} style={{ display: "none" }} onChange={pick} />
            </label>
          </div>
        ) : (
          <div style={{ border: "1px dashed #cbd5e1", background: "#f8fafc", borderRadius: 12, height: 150, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            <UploadCloud size={30} color="#94a3b8" />
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#3b82f6", fontWeight: 500 }}>Выберите файл</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>или перетащите сюда</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileCard;
