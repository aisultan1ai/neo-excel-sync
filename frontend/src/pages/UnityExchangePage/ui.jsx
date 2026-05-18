import React from "react";

export const Input = ({ label, value, onChange }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 210 }}>
    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>{label}</div>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ height: 38, borderRadius: 10, border: "1px solid #e2e8f0", padding: "0 10px", fontWeight: 400 }}
    />
  </div>
);

export const Check = ({ label, checked, onChange }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span style={{ fontSize: 13, fontWeight: 400, color: "#334155" }}>{label}</span>
  </label>
);
