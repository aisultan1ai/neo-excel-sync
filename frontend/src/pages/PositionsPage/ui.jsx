import React from "react";
import { STATUS, T } from "./helpers";

export const StatusBadge = ({ status, count }) => {
  const s = STATUS[status];
  return (
    <span title={s.hint} style={{ background: s.bg, color: s.fg, borderRadius: 100, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}{count != null ? ` · ${count}` : ""}
    </span>
  );
};

export const StatTile = ({ label, value, color = T.ink, hint }) => (
  <div title={hint} style={{ flex: "1 1 150px", padding: "12px 14px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10 }}>
    <div style={T.label}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);
