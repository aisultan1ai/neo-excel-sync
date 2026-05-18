import React from "react";
import { Upload } from "lucide-react";

const SplitsTab = ({ settings, canEdit, handleChange, handleToggle, handleSplitFileSelect }) => (
  <div className="fade-in">
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
      <h3 style={{ margin: 0 }}>Настройки Сплитов</h3>
      <label className="switch">
        <input type="checkbox" disabled={!canEdit} checked={settings.split_check_enabled} onChange={() => handleToggle("split_check_enabled")} />
        <span className={`slider round ${!canEdit ? "disabled" : ""}`}></span>
      </label>
    </div>
    {settings.split_check_enabled && (
      <>
        <div className="input-group" style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <label className="input-label" style={{ marginBottom: "10px" }}>Файл справочника</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input className="text-input" disabled value={settings.split_list_path ? settings.split_list_path.split(/[\\/]/).pop() : "Нет файла"} style={{ marginBottom: 0, background: "white" }} />
            {canEdit && (
              <label className="btn" style={{ cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}>
                <Upload size={16} /> Обзор...
                <input type="file" hidden accept=".xlsx, .xls" onChange={handleSplitFileSelect} />
              </label>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "15px", marginTop: "20px" }}>
          {[
            { label: "Столбец ISIN", key: "split_list_isin_col" },
            { label: "Столбец ЦБ", key: "daily_file_security_col" },
            { label: "Столбец Кол-во", key: "split_daily_qty_col" },
          ].map(({ label, key }) => (
            <div key={key} className="input-group">
              <label className="input-label">{label}</label>
              <input className="text-input" disabled={!canEdit} value={settings[key]} onChange={(e) => handleChange(key, e.target.value)} />
            </div>
          ))}
        </div>
      </>
    )}
  </div>
);

export default SplitsTab;
