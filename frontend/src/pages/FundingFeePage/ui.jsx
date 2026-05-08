import React from "react";
import { X } from "lucide-react";
import { T, S, PERIOD_PRESETS } from "./helpers";

// ─── micro components ─────────────────────────────────────────────────────────

export const Label = ({ children, style }) => (
  <span style={{ ...T.label, ...style }}>{children}</span>
);

export const Pill = ({ children, color = "#e2e8f0", text = "#475569" }) => (
  <span style={{ background: color, color: text, borderRadius: 100, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
    {children}
  </span>
);

export const StatusPill = ({ s }) => {
  const map = {
    success: ["#dcfce7", "#15803d", "Успех"],
    error:   ["#fee2e2", "#dc2626", "Ошибка"],
    pending: ["#fef9c3", "#a16207", "Ожидает"],
  };
  const [bg, clr, lbl] = map[s] || map.pending;
  return <Pill color={bg} text={clr}>{lbl}</Pill>;
};

export const TxPill = ({ t }) => {
  if (t === "cashin")  return <Pill color="#dbeafe" text="#1d4ed8">Cash In</Pill>;
  if (t === "cashout") return <Pill color="#fce7f3" text="#9d174d">Cash Out</Pill>;
  return null;
};

export const SectionTitle = ({ children, style }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${T.border}`, ...style }}>
    {children}
  </div>
);

export const StatCard = ({ label, value, sub, accent }) => (
  <div style={{ flex: "1 1 160px", minWidth: 140, background: "#fff", border: `1px solid ${T.border}`, borderTop: `3px solid ${accent || T.blue}`, borderRadius: 10, padding: "14px 16px" }}>
    <div style={T.label}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: accent || T.ink, marginTop: 6 }}>{value}</div>
    {sub && <div style={{ ...T.small, marginTop: 2 }}>{sub}</div>}
  </div>
);

// ─── period preset strip ──────────────────────────────────────────────────────

export const PeriodStrip = ({ onSelect }) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
    <span style={{ ...T.label, alignSelf: "center", marginRight: 4 }}>Период:</span>
    {PERIOD_PRESETS.map(({ label, start, end }) => (
      <button key={label} type="button"
        onClick={() => onSelect(start(), end())}
        style={{ fontSize: 12, padding: "4px 12px", borderRadius: 100, border: `1px solid ${T.border}`, background: "#fff", cursor: "pointer", color: T.muted, fontWeight: 500, transition: "all 0.15s" }}
        onMouseEnter={e => { e.target.style.borderColor = T.blue; e.target.style.color = T.blue; }}
        onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.muted; }}
      >{label}</button>
    ))}
  </div>
);

// ─── modals ───────────────────────────────────────────────────────────────────

export const Overlay = ({ children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
    {children}
  </div>
);

export const Modal = ({ title, onClose, children, width = 460 }) => (
  <Overlay>
    <div style={{ background: "#fff", borderRadius: 14, width, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.faint, padding: 4, borderRadius: 6, display: "flex" }}>
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  </Overlay>
);

// ─── tab nav ──────────────────────────────────────────────────────────────────

import { List, BarChart2, TrendingUp, Calendar, Settings } from "lucide-react";

const TABS = [
  { id: "accounts", label: "Аккаунты",   Icon: List },
  { id: "data",     label: "Данные",     Icon: BarChart2 },
  { id: "history",  label: "Транзакции", Icon: TrendingUp },
  { id: "schedule", label: "Расписание", Icon: Calendar },
  { id: "settings", label: "Настройки",  Icon: Settings },
];

export const TabNav = ({ active, onChange }) => (
  <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `2px solid ${T.border}` }}>
    {TABS.map(({ id, label, Icon }) => {
      const isActive = active === id;
      return (
        <button key={id} onClick={() => onChange(id)} style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "9px 16px", border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: isActive ? 600 : 500,
          color: isActive ? T.blue : T.muted,
          background: isActive ? "#eff6ff" : "transparent",
          borderBottom: `2px solid ${isActive ? T.blue : "transparent"}`,
          marginBottom: -2, borderRadius: "6px 6px 0 0",
          transition: "all 0.15s",
        }}>
          <Icon size={14} />
          {label}
        </button>
      );
    })}
  </div>
);
