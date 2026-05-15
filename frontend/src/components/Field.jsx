import React from "react";

const Field = ({ label, hint, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div
      style={{
        display: "flex", alignItems: "baseline",
        justifyContent: "space-between", gap: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</div>
      {hint ? <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div> : null}
    </div>
    {children}
  </div>
);

export default Field;
