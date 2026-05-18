import React from "react";

const DatabaseTab = ({ settings, canEdit, handleOverlapChange }) => (
  <div className="fade-in">
    <h3 style={{ marginTop: 0 }}>Счета перекрытия (Исключения)</h3>
    <p style={{ fontSize: "13px", color: "#64748b" }}>Каждый счет с новой строки. Эти счета будут игнорироваться при сверке.</p>
    <textarea
      className="text-input"
      disabled={!canEdit}
      style={{ height: "250px", fontFamily: "monospace", lineHeight: "1.6" }}
      value={settings.overlap_accounts.join("\n")}
      onChange={handleOverlapChange}
    />
  </div>
);

export default DatabaseTab;
