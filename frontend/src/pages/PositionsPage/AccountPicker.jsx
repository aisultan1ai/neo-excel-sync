import React, { useState } from "react";
import { toast } from "react-toastify";
import { Check, Loader2, Plus, Wallet, X } from "lucide-react";
import { T, S } from "./helpers";
import { addAccounts, deleteAccount } from "./api";

const AccountChip = ({ account, active, onToggle, onDelete }) => {
  const [hover, setHover] = useState(false);
  const highlighted = active || hover;
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center",
        borderRadius: 8,
        border: `1px solid ${highlighted ? T.blue : T.border}`,
        background: "#fff",
        boxShadow: active ? "0 1px 2px rgba(59,130,246,0.15)" : "none",
        transition: "all 0.15s",
      }}
    >
      <button type="button" onClick={onToggle}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, fontWeight: active ? 600 : 500,
          padding: active ? "5px 4px 5px 8px" : "5px 4px 5px 12px",
          border: "none", background: "transparent", cursor: "pointer",
          color: highlighted ? T.blue : T.ink,
        }}
      >
        {active && (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 4, background: T.blue, color: "#fff" }}>
            <Check size={10} strokeWidth={3} />
          </span>
        )}
        {account.name || `Счёт ${account.account_id}`}
        <span style={{ fontSize: 11, color: T.faint, fontWeight: 400 }}>{account.account_id}</span>
      </button>
      <button type="button" title="Удалить счёт из списка" onClick={onDelete}
        style={{ ...S.iconBtn, padding: "4px 6px 4px 2px", color: hover ? T.red : T.faint }}>
        <X size={13} />
      </button>
    </span>
  );
};

export default function AccountPicker({ accounts, selected, setSelected, onRefresh }) {
  const [input,  setInput]  = useState("");
  const [saving, setSaving] = useState(false);

  const ids = accounts.map(a => a.account_id);
  const allSelected = accounts.length > 0 && ids.every(id => selected.includes(id));

  const toggle = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleAdd = async () => {
    const parsed = [...new Set(input.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
    if (!parsed.length) return;
    const bad = parsed.filter(s => !/^\d+$/.test(s));
    if (bad.length) { toast.warn(`Некорректный ID счёта: ${bad.join(", ")}`); return; }
    setSaving(true);
    try {
      const { data } = await addAccounts(parsed);
      await onRefresh();
      setSelected(prev => [...new Set([...prev, ...parsed])]);
      setInput("");
      if (data.added.length) toast.success(`Добавлено счетов: ${data.added.length}`);
      if (data.skipped.length) toast.info(`Уже в списке: ${data.skipped.join(", ")}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка добавления счетов");
    } finally { setSaving(false); }
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(`Удалить счёт "${acc.name || acc.account_id}" из списка сверки?`)) return;
    try {
      await deleteAccount(acc.id);
      setSelected(prev => prev.filter(x => x !== acc.account_id));
      await onRefresh();
      toast.success("Счёт удалён");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка удаления");
    }
  };

  return (
    <div style={{ marginBottom: 16, padding: "12px 14px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wallet size={13} color={T.muted} />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>Счета</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 100,
            background: selected.length ? "#eff6ff" : "#fff",
            color: selected.length ? T.blue : T.muted,
            border: `1px solid ${selected.length ? "#bfdbfe" : T.border}`,
          }}>
            {selected.length ? `${selected.length} из ${accounts.length}` : `не выбраны · ${accounts.length}`}
          </span>
        </div>
        {accounts.length > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" disabled={allSelected} onClick={() => setSelected(ids)}
              style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 6, border: "none", background: "transparent",
                cursor: allSelected ? "not-allowed" : "pointer", color: allSelected ? T.faint : T.blue }}>
              Выбрать все
            </button>
            <button type="button" onClick={() => setSelected([])} disabled={!selected.length}
              style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 6, border: "none", background: "transparent",
                cursor: selected.length ? "pointer" : "not-allowed", color: selected.length ? T.muted : T.faint }}>
              Сбросить
            </button>
          </div>
        )}
      </div>

      {accounts.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {accounts.map(a => (
            <AccountChip key={a.id} account={a}
              active={selected.includes(a.account_id)}
              onToggle={() => toggle(a.account_id)}
              onDelete={() => handleDelete(a)} />
          ))}
        </div>
      ) : (
        <div style={{ ...T.small, marginBottom: 12 }}>
          Список пуст — добавьте ID счетов Unity. Они сохранятся и будут доступны при следующем входе.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input className="text-input" value={input} disabled={saving}
          placeholder="ID счёта Unity — можно несколько через запятую"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
          style={{ maxWidth: 420, background: "#fff" }} />
        <button type="button" onClick={handleAdd} disabled={!input.trim() || saving}
          style={{ ...S.ghost, whiteSpace: "nowrap", opacity: input.trim() && !saving ? 1 : 0.5,
            cursor: input.trim() && !saving ? "pointer" : "not-allowed" }}>
          {saving
            ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
            : <Plus size={14} style={{ marginRight: 6 }} />}
          Добавить
        </button>
      </div>
    </div>
  );
}
