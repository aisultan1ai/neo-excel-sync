import React, { useState } from "react";
import { toast } from "react-toastify";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { SectionTitle, Modal } from "./ui";
import { T, S } from "./helpers";
import { createAccount, deleteAccount } from "./api";

export default function AccountsTab({ accounts, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ name: "", account_id: "", asset_id: "" });
  const [saving, setSaving]   = useState(false);

  const handleAdd = async () => {
    if (!form.name || !form.account_id || !form.asset_id) {
      toast.error("Заполните все поля"); return;
    }
    setSaving(true);
    try {
      await createAccount(form);
      toast.success("Счёт добавлен");
      setShowAdd(false);
      setForm({ name: "", account_id: "", asset_id: "" });
      onRefresh();
    } catch (err) { toast.error(err?.response?.data?.detail || "Ошибка"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Удалить счёт "${name}"?`)) return;
    try {
      await deleteAccount(id);
      toast.success("Счёт удалён");
      onRefresh();
    } catch { toast.error("Ошибка удаления"); }
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Счета для мониторинга</span>
          <button className="btn" onClick={() => setShowAdd(true)}>
            <Plus size={14} style={{ marginRight: 6 }} />Добавить счёт
          </button>
        </div>

        {accounts.length === 0 ? (
          <div style={S.empty}>
            <p style={{ color: T.faint, margin: 0 }}>Нет добавленных счетов.</p>
            <p style={{ color: T.faint, margin: "6px 0 0", fontSize: 12 }}>Нажмите «Добавить счёт» чтобы начать.</p>
          </div>
        ) : (
          <div className="result-table-wrapper">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th style={{ textAlign: "right" }}>accountId</th>
                  <th style={{ textAlign: "right" }}>assetId</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{acc.name}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>{acc.account_id}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>{acc.asset_id}</td>
                    <td>
                      <button style={S.iconBtn} onClick={() => handleDelete(acc.id, acc.name)} title="Удалить">
                        <Trash2 size={15} color={T.red} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Добавить счёт" onClose={() => setShowAdd(false)} width={400}>
          <div style={{ padding: "20px 24px 24px" }}>
            {[["name", "Название", "Мой счёт"], ["account_id", "accountId", "12345"], ["asset_id", "assetId", "840"]].map(([key, label, placeholder]) => (
              <div key={key} className="input-group" style={{ marginBottom: 14 }}>
                <label className="input-label">{label}</label>
                <input className="text-input" placeholder={placeholder}
                  value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={S.ghost} onClick={() => setShowAdd(false)}>Отмена</button>
              <button className="btn" onClick={handleAdd} disabled={saving}>
                {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Сохранить"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
