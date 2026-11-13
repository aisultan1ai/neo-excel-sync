import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import Modal from "../../components/Modal";
import { createTx, updateTx } from "./api";
import { DIR_LABEL, T, errText, nowInputDT, toInputDT, whoLabel } from "./helpers";

const empty = (sectionId) => ({
  section_id: sectionId || "",
  tx_time: nowInputDT(),
  counterparty: "",
  amount: "",
  asset: "",
  tx_hash: "",
  comment: "",
});

export default function TxModal({ open, tx, defaultSectionId, sections, counterparties, onClose, onSaved }) {
  const [form, setForm] = useState(empty(defaultSectionId));
  const [saving, setSaving] = useState(false);
  const editing = !!tx?.id;

  // в форме — активные разделы; архивный показываем, только если транзакция уже в нём
  const options = sections.filter((s) => !s.archived || s.id === tx?.section_id);

  useEffect(() => {
    if (!open) return;
    setForm(tx?.id ? {
      section_id: tx.section_id,
      tx_time: toInputDT(tx.tx_time),
      counterparty: tx.counterparty || "",
      amount: String(tx.amount ?? ""),
      asset: tx.asset || "",
      tx_hash: tx.tx_hash || "",
      comment: tx.comment || "",
    } : empty(defaultSectionId || sections.find((s) => !s.archived)?.id));
  }, [open, tx, defaultSectionId, sections]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const section = sections.find((s) => s.id === Number(form.section_id));

  const handleSave = async () => {
    const amount = Number(String(form.amount).replace(/\s/g, "").replace(",", "."));
    if (!form.section_id) { toast.warn("Выберите раздел"); return; }
    if (!form.tx_time) { toast.warn("Укажите дату и время"); return; }
    if (!(amount > 0)) { toast.warn("Сумма должна быть больше нуля"); return; }
    const payload = {
      ...form,
      section_id: Number(form.section_id),
      amount,
      tx_time: form.tx_time.length === 16 ? `${form.tx_time}:00` : form.tx_time,
    };
    setSaving(true);
    try {
      if (editing) await updateTx(tx.id, payload);
      else await createTx(payload);
      toast.success(editing ? "Изменения сохранены" : "Транзакция добавлена");
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(errText(err, "Ошибка сохранения"));
    } finally { setSaving(false); }
  };

  const listId = `cp-${form.section_id}`;
  const field = (label, input, hint) => (
    <div className="input-group" style={{ margin: 0 }}>
      <label className="input-label">{label}</label>
      {input}
      {hint && <div style={{ ...T.small, fontSize: 11, marginTop: 3 }}>{hint}</div>}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} width={640}
      title={editing ? "Изменить транзакцию" : "Новая транзакция"}
      subtitle={editing ? `ID ${tx.id}` : "Добавление вручную"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />}
            Сохранить
          </button>
        </>
      }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          {field("Раздел",
            <select className="text-input" value={form.section_id} onChange={set("section_id")} style={{ width: "100%" }}>
              {!options.length && <option value="">— нет разделов —</option>}
              {options.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({DIR_LABEL[s.direction]}){s.archived ? " · в архиве" : ""}</option>
              ))}
            </select>)}
        </div>
        {field("Дата и время",
          <input className="text-input" type="datetime-local" value={form.tx_time} onChange={set("tx_time")} style={{ width: "100%" }} />)}
        {field(whoLabel(section),
          <>
            <input className="text-input" list={listId} value={form.counterparty} onChange={set("counterparty")}
              placeholder="Биржа, кошелёк или имя" style={{ width: "100%" }} />
            <datalist id={listId}>
              {(counterparties?.[form.section_id] || []).map((n) => <option key={n} value={n} />)}
            </datalist>
          </>)}
        {field("Сумма",
          <input className="text-input" inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0" style={{ width: "100%" }} />)}
        {field("Актив",
          <input className="text-input" value={form.asset} onChange={set("asset")} placeholder="USDT, BTC… (необязательно)" style={{ width: "100%", textTransform: "uppercase" }} />)}
        <div style={{ gridColumn: "1 / -1" }}>
          {field("Хэш транзакции",
            <input className="text-input" value={form.tx_hash} onChange={set("tx_hash")} placeholder="0x… или txid" style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />,
            "Повтор хэша в том же разделе не допускается")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          {field("Комментарий",
            <textarea className="text-input" value={form.comment} onChange={set("comment")} rows={2} style={{ width: "100%", resize: "vertical" }} />)}
        </div>
      </div>
    </Modal>
  );
}
