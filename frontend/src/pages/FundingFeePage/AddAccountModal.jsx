import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { Modal } from "./ui";
import { S } from "./helpers";
import { createAccount } from "./api";

export default function AddAccountModal({ onClose, onSaved }) {
  const [form, setForm]       = useState({ name: "", api_key: "", api_secret: "" });
  const [saving, setSaving]   = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const handle = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.api_key.trim() || !form.api_secret.trim()) {
      toast.error("Заполните все поля");
      return;
    }
    setSaving(true);
    try {
      const { data } = await createAccount(form);
      toast.success("Аккаунт добавлен");
      onSaved(data);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Добавить Binance аккаунт" onClose={onClose}>
      <form onSubmit={submit} style={{ padding: "20px 24px 24px" }}>
        {[
          { name: "name",       label: "Название",   type: "text",                              ph: "Main Futures",     show: null },
          { name: "api_key",    label: "API Key",    type: showKey    ? "text" : "password",    ph: "Binance API Key",  show: [showKey,    setShowKey] },
          { name: "api_secret", label: "API Secret", type: showSecret ? "text" : "password",    ph: "Binance API Secret", show: [showSecret, setShowSecret] },
        ].map(({ name, label, type, ph, show }) => (
          <div key={name} className="input-group" style={{ marginBottom: 14 }}>
            <label className="input-label">{label}</label>
            <div style={{ position: "relative" }}>
              <input className="text-input" name={name} type={type} placeholder={ph}
                value={form[name]} onChange={handle} autoFocus={name === "name"}
                style={show ? { paddingRight: 38 } : {}} />
              {show && (
                <button type="button" style={S.eyeBtn} onClick={() => show[1]((p) => !p)}>
                  {show[0] ? "🙈" : "👁"}
                </button>
              )}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" onClick={onClose} style={S.ghost}>Отмена</button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : "Сохранить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
