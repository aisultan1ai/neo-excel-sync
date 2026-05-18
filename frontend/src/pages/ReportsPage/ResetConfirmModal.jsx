import React from "react";
import { AlertTriangle } from "lucide-react";

const ResetConfirmModal = ({ onConfirm, onCancel }) => (
  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000, backdropFilter: "blur(3px)" }}>
    <div className="card" style={{ width: "400px", padding: "30px", textAlign: "center", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
      <div style={{ margin: "0 auto 20px auto", width: "60px", height: "60px", background: "#fee2e2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AlertTriangle size={32} color="#ef4444" />
      </div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: "20px", color: "#1f2937" }}>Сбросить статусы?</h3>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "25px", lineHeight: "1.5" }}>
        Вы собираетесь сбросить статус <b>ВСЕХ</b> клиентов на "Нет отчетов". <br />
        Это действие нельзя отменить.
      </p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
        <button className="btn" onClick={onCancel} style={{ background: "white", color: "#374151", border: "1px solid #d1d5db" }}>Отмена</button>
        <button className="btn" onClick={onConfirm} style={{ background: "#ef4444", color: "white", border: "none" }}>Да, сбросить</button>
      </div>
    </div>
  </div>
);

export default ResetConfirmModal;
