import React, { useCallback, useRef, useState } from "react";
import Modal from "./Modal";

const useConfirm = () => {
  const [cfg, setCfg] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setCfg({
        open: true,
        title: options?.title || "Подтверждение",
        subtitle: options?.subtitle || "",
        confirmText: options?.confirmText || "Да",
        cancelText: options?.cancelText || "Отмена",
        danger: !!options?.danger,
      });
    });
  }, []);

  const close = useCallback((result) => {
    setCfg(null);
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.(result);
  }, []);

  const ConfirmDialog = useCallback(() => {
    if (!cfg?.open) return null;

    return (
      <Modal
        open={cfg.open}
        title={cfg.title}
        subtitle={cfg.subtitle}
        onClose={() => close(false)}
        width={560}
        footer={
          <>
            <button className="btn-secondary" onClick={() => close(false)}>
              {cfg.cancelText}
            </button>
            <button
              className="btn-primary"
              onClick={() => close(true)}
              style={{
                background: cfg.danger ? "#ef4444" : undefined,
                borderColor: cfg.danger ? "#ef4444" : undefined,
              }}
            >
              {cfg.confirmText}
            </button>
          </>
        }
      >
        <div
          style={{
            fontSize: 13, color: "#64748b", lineHeight: 1.45,
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 12, padding: 12,
          }}
        >
          {cfg.danger ? (
            <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>
              Действие необратимо.
            </div>
          ) : null}
          <div>Подтвердить действие?</div>
        </div>
      </Modal>
    );
  }, [cfg, close]);

  return { confirm, ConfirmDialog };
};

export default useConfirm;
