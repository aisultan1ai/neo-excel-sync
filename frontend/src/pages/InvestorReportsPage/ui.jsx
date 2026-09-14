import React, { useEffect, useRef, useState } from "react";
import { Check, X, AlertTriangle, Info } from "lucide-react";

/* ── Step indicator (wizard) ────────────────────────────────── */

export const StepIndicator = ({ current }) => {
  // current: "upload" | "preview" | "details"
  const steps = [
    { id: "upload",  label: "Загрузка" },
    { id: "preview", label: "Превью" },
    { id: "details", label: "Отчёты" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);

  return (
    <div style={{
      display: "flex", justifyContent: "center",
      marginBottom: 28, marginTop: 4,
    }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 12 }}>
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <React.Fragment key={step.id}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 12px", borderRadius: 999,
                background: active ? "#eff6ff" : "transparent",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: done ? "#10b981" : active ? "#3b82f6" : "#e2e8f0",
                  color: done || active ? "#fff" : "#94a3b8",
                  fontWeight: 700, fontSize: 11,
                  transition: "all 0.2s ease",
                }}>
                  {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                </div>
                <span style={{
                  color: active ? "#1e40af" : done ? "#64748b" : "#94a3b8",
                  fontWeight: active ? 600 : 500,
                  letterSpacing: 0.1,
                }}>{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  width: 24, height: 2, borderRadius: 1,
                  background: i < currentIdx ? "#10b981" : "#e2e8f0",
                  transition: "background 0.3s ease",
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/* Wrapper для верхней панели: back-link слева, степпер по центру */
export const PageTopBar = ({ onBack, backLabel = "Назад", current }) => (
  <div style={{ position: "relative", minHeight: 32, marginBottom: 4 }}>
    {onBack && (
      <button onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "transparent", border: "none", color: "#3b82f6",
        fontSize: 13, fontWeight: 500, cursor: "pointer", padding: 0,
      }}>
        <ArrowLeftIcon /> {backLabel}
      </button>
    )}
    <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)" }}>
      <StepIndicator current={current} />
    </div>
  </div>
);

const ArrowLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

/* ── Confirm dialog (modal) ─────────────────────────────────── */

export const ConfirmDialog = ({ open, title, message, confirmText = "Удалить",
                                cancelText = "Отмена", danger = true, onConfirm, onCancel }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onConfirm?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, backdropFilter: "blur(2px)",
      }}
    >
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, padding: 24, width: 400, maxWidth: "90vw",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{
            background: danger ? "#fee2e2" : "#dbeafe", padding: 10, borderRadius: "50%",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertTriangle size={20} color={danger ? "#ef4444" : "#3b82f6"} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: "4px 0 6px 0", fontSize: 16, color: "#1e293b" }}>{title}</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onCancel} className="btn"
            style={{ background: "#e2e8f0", color: "#334155", padding: "8px 18px" }}>
            {cancelText}
          </button>
          <button type="button" onClick={onConfirm} className="btn"
            style={{ background: danger ? "#ef4444" : "#3b82f6", padding: "8px 18px" }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Info tooltip (простой) ─────────────────────────────────── */

export const InfoHint = ({ text, size = 12 }) => (
  <span title={text}
    style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: 4, cursor: "help" }}>
    <Info size={size} color="#94a3b8" />
  </span>
);

/* ── Skeleton row для таблиц ─────────────────────────────────── */

export const SkeletonRow = ({ cols = 5 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i}>
        <div style={{
          height: 14, background: "#e2e8f0", borderRadius: 4,
          width: `${40 + Math.random() * 40}%`,
          animation: "skeleton-pulse 1.4s ease-in-out infinite",
        }} />
      </td>
    ))}
  </tr>
);

/* ── Auto-growing textarea ──────────────────────────────────── */

export const AutoGrowTextarea = React.forwardRef((props, ref) => {
  const innerRef = useRef(null);
  const textareaRef = ref || innerRef;

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 500) + "px";
  };

  useEffect(() => { adjustHeight(); }, [props.value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      onInput={(e) => { adjustHeight(); props.onInput?.(e); }}
      style={{ ...props.style, overflow: "hidden", resize: "none" }}
    />
  );
});
AutoGrowTextarea.displayName = "AutoGrowTextarea";

/* ── Global animation styles ────────────────────────────────── */

export const InvestorReportStyles = () => (
  <style>{`
    @keyframes skeleton-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }
    .ir-search-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
  `}</style>
);
