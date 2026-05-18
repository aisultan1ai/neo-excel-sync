import React from "react";

const PodftTab = ({ settings, canEdit, handleChange, handleToggle }) => (
  <div className="fade-in">
    <h3 style={{ marginTop: 0, marginBottom: "25px" }}>Финансовый мониторинг (ПОД/ФТ)</h3>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
      <div className="input-group">
        <label className="input-label">Колонка "Сумма"</label>
        <input className="text-input" disabled={!canEdit} value={settings.podft_sum_col} onChange={(e) => handleChange("podft_sum_col", e.target.value)} />
      </div>
      <div className="input-group">
        <label className="input-label">Порог (KZT)</label>
        <input className="text-input" disabled={!canEdit} value={settings.podft_threshold} onChange={(e) => handleChange("podft_threshold", e.target.value)} />
      </div>
    </div>
    <div style={{ marginTop: "20px", padding: "20px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, color: "#334155" }}>Фильтр исключений</span>
        <label className="switch">
          <input type="checkbox" disabled={!canEdit} checked={settings.podft_filter_enabled} onChange={() => handleToggle("podft_filter_enabled")} />
          <span className={`slider round ${!canEdit ? "disabled" : ""}`}></span>
        </label>
      </div>
      {settings.podft_filter_enabled && (
        <div style={{ marginTop: "15px" }}>
          <div className="input-group">
            <label className="input-label">Колонка фильтра</label>
            <input className="text-input" disabled={!canEdit} value={settings.podft_filter_col} onChange={(e) => handleChange("podft_filter_col", e.target.value)} />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Исключать значения (через запятую)</label>
            <input className="text-input" disabled={!canEdit} value={settings.podft_filter_values} onChange={(e) => handleChange("podft_filter_values", e.target.value)} />
          </div>
        </div>
      )}
    </div>
  </div>
);

export default PodftTab;
