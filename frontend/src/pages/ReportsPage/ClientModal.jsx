import React from "react";
import { X } from "lucide-react";

const ClientModal = ({ title, data, setData, onSave, onClose }) => (
  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100 }}>
    <div className="card" style={{ width: "400px", padding: "30px", position: "relative" }}>
      <button onClick={onClose} style={{ position: "absolute", top: "10px", right: "10px", background: "none", border: "none", cursor: "pointer" }}>
        <X size={20} />
      </button>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {[
        { label: "Имя", key: "name" },
        { label: "Email", key: "email" },
        { label: "Счет", key: "account" },
        { label: "Папка", key: "folder_path" },
      ].map(({ label, key }) => (
        <div key={key} className="input-group">
          <label>{label}</label>
          <input className="text-input" value={data[key]} onChange={(e) => setData({ ...data, [key]: e.target.value })} />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
        <button className="btn" style={{ background: "#94a3b8" }} onClick={onClose}>Отмена</button>
        <button className="btn" onClick={onSave}>Сохранить</button>
      </div>
    </div>
  </div>
);

export default ClientModal;
