import React, { useEffect } from "react";
import { X } from "lucide-react";

const Modal = ({ open, title, subtitle, children, onClose, footer, width = 860 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) onClose?.(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, zIndex: 2000,
      }}
    >
      <div
        className="modal-card"
        style={{
          width: `min(${width}px, 100%)`,
          background: "white", borderRadius: 14,
          border: "1px solid #e2e8f0",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px", borderBottom: "1px solid #e2e8f0",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 12, background: "#f8fafc",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16 }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            title="Закрыть"
            style={{
              width: 38, height: 38, borderRadius: 10,
              border: "1px solid #e2e8f0", background: "white",
              cursor: "pointer", display: "grid", placeItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>{children}</div>

        {footer ? (
          <div
            style={{
              padding: "14px 18px", borderTop: "1px solid #e2e8f0",
              background: "#f8fafc", display: "flex",
              justifyContent: "flex-end", gap: 10, flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Modal;
