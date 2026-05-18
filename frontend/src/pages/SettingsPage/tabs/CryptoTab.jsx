import React from "react";

const CryptoTab = ({ settings, canEdit, handleChange, handleToggle }) => (
  <div className="fade-in">
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
      <h3 style={{ margin: 0 }}>Криптовалюта</h3>
      <label className="switch">
        <input type="checkbox" disabled={!canEdit} checked={settings.crypto_enabled} onChange={() => handleToggle("crypto_enabled")} />
        <span className={`slider round ${!canEdit ? "disabled" : ""}`}></span>
      </label>
    </div>
    {settings.crypto_enabled ? (
      <>
        <div className="input-group">
          <label className="input-label">Колонка поиска</label>
          <input className="text-input" disabled={!canEdit} value={settings.crypto_col} onChange={(e) => handleChange("crypto_col", e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Ключевые слова</label>
          <textarea className="text-input" disabled={!canEdit} style={{ height: "100px" }} value={settings.crypto_keywords} onChange={(e) => handleChange("crypto_keywords", e.target.value)} />
          <div className="hint">Разделитель запятая (USDT, BTC, ETH)</div>
        </div>
      </>
    ) : (
      <p style={{ color: "#94a3b8", textAlign: "center", padding: "20px", background: "#f8fafc", borderRadius: "8px" }}>Функция выключена</p>
    )}
  </div>
);

export default CryptoTab;
