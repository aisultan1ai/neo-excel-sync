import React from "react";

const BondsTab = ({ settings, canEdit, handleChange, handleToggle }) => (
  <div className="fade-in">
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
      <h3 style={{ margin: 0 }}>Бонды и Опционы</h3>
      <label className="switch">
        <input type="checkbox" disabled={!canEdit} checked={settings.bo_enabled} onChange={() => handleToggle("bo_enabled")} />
        <span className={`slider round ${!canEdit ? "disabled" : ""}`}></span>
      </label>
    </div>
    {settings.bo_enabled && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {[
          { label: "Колонка Instrument", key: "bo_unity_instrument_col" },
          { label: "Колонка Сумма", key: "bo_ais_sum_col" },
          { label: "Порог", key: "bo_threshold" },
          { label: "Префиксы", key: "bo_prefixes" },
        ].map(({ label, key }) => (
          <div key={key} className="input-group">
            <label className="input-label">{label}</label>
            <input className="text-input" disabled={!canEdit} value={settings[key]} onChange={(e) => handleChange(key, e.target.value)} />
          </div>
        ))}
      </div>
    )}
  </div>
);

export default BondsTab;
