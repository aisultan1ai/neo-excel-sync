import React from "react";

const GeneralTab = ({ settings, canEdit, handleChange, handleArrayChange }) => (
  <div className="fade-in">
    <h3 style={{ marginTop: 0, marginBottom: "25px" }}>Основные параметры</h3>
    <div className="input-group">
      <label className="input-label">Варианты названия столбца ID</label>
      <input className="text-input" disabled={!canEdit} value={settings.default_id_names.join(", ")} onChange={(e) => handleArrayChange("default_id_names", e.target.value)} />
      <div className="hint">Используются для автоматического поиска ID сделки</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
      <div className="input-group">
        <label className="input-label">Счет в Unity</label>
        <input className="text-input" disabled={!canEdit} value={settings.default_acc_name_unity} onChange={(e) => handleChange("default_acc_name_unity", e.target.value)} />
      </div>
      <div className="input-group">
        <label className="input-label">Счет в АИС</label>
        <input className="text-input" disabled={!canEdit} value={settings.default_acc_name_ais} onChange={(e) => handleChange("default_acc_name_ais", e.target.value)} />
      </div>
    </div>
  </div>
);

export default GeneralTab;
