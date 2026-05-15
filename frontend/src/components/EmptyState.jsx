import React from "react";

const EmptyState = ({ title, text, action }) => (
  <div className="card" style={{ padding: 18, textAlign: "center" }}>
    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16 }}>{title}</div>
    <div style={{ marginTop: 8, color: "#64748b", fontSize: 13, lineHeight: 1.4 }}>{text}</div>
    {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
  </div>
);

export default EmptyState;
