import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import Modal from "../../components/Modal";
import { createSection, deleteSection, updateSection } from "./api";
import { S, T, errText } from "./helpers";

const blank = { name: "", direction: "in", counterparty_label: "" };

const DirSelect = ({ value, onChange }) => (
  <select className="text-input" value={value} onChange={onChange} style={{ width: 130 }}>
    <option value="in">Пополнение</option>
    <option value="out">Вывод</option>
  </select>
);

export default function SectionsModal({ open, sections, onClose, onChanged }) {
  const [edits, setEdits]   = useState({});      // id → {name, direction, counterparty_label}
  const [busy, setBusy]     = useState(null);    // id | "new"
  const [nw, setNw]         = useState(blank);
  const [delFor, setDelFor] = useState(null);    // раздел, который удаляем с переносом
  const [moveTo, setMoveTo] = useState("");

  useEffect(() => {
    if (!open) return;
    setEdits(Object.fromEntries(sections.map((s) => [s.id, {
      name: s.name, direction: s.direction, counterparty_label: s.counterparty_label || "",
    }])));
  }, [open, sections]);

  const run = async (key, fn, okText) => {
    setBusy(key);
    try { await fn(); if (okText) toast.success(okText); await onChanged?.(); return true; }
    catch (err) { toast.error(errText(err, "Ошибка")); return false; }
    finally { setBusy(null); }
  };

  const changed = (s) => {
    const e = edits[s.id];
    return e && (e.name.trim() !== s.name || e.direction !== s.direction || (e.counterparty_label || "") !== (s.counterparty_label || ""));
  };

  const save = (s) => {
    const e = edits[s.id];
    if (!e.name.trim()) { toast.warn("Название не может быть пустым"); return; }
    run(s.id, () => updateSection(s.id, { name: e.name, direction: e.direction, counterparty_label: e.counterparty_label }), "Раздел сохранён");
  };

  const move = (idx, dir) => {
    const a = sections[idx], b = sections[idx + dir];
    if (!b) return;
    // меняем местами sort_order; если совпадают — разводим
    const ao = a.sort_order, bo = b.sort_order === a.sort_order ? a.sort_order + dir : b.sort_order;
    run(a.id, async () => { await updateSection(a.id, { sort_order: bo }); await updateSection(b.id, { sort_order: ao }); });
  };

  const remove = (s) => {
    if (s.tx_count > 0) { setDelFor(s); setMoveTo(""); return; }
    run(s.id, () => deleteSection(s.id), "Раздел удалён");
  };

  const confirmMove = () => {
    if (!moveTo) { toast.warn("Выберите раздел для переноса"); return; }
    const s = delFor;
    run(s.id, () => deleteSection(s.id, Number(moveTo)), `Раздел удалён, ${s.tx_count} транзакций перенесено`)
      .then((ok) => ok && setDelFor(null));
  };

  const add = () => {
    if (!nw.name.trim()) { toast.warn("Укажите название раздела"); return; }
    run("new", () => createSection(nw), "Раздел добавлен").then((ok) => ok && setNw(blank));
  };

  return (
    <Modal open={open} onClose={onClose} width={980} title="Разделы"
      subtitle="Название раздела совпадает с заголовком блока в Excel — по нему импорт понимает, куда относятся строки"
      footer={<button className="btn" onClick={onClose}>Готово</button>}>
      <div style={{ maxHeight: "55vh", overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={S.th}>Порядок</th>
              <th style={S.th}>Название</th>
              <th style={S.th}>Направление</th>
              <th style={S.th}>Подпись «Откуда/Куда»</th>
              <th style={{ ...S.th, textAlign: "right" }}>Транз.</th>
              <th style={S.th} />
            </tr>
          </thead>
          <tbody>
            {sections.map((s, i) => {
              const e = edits[s.id] || {};
              const set = (k) => (ev) => setEdits((x) => ({ ...x, [s.id]: { ...x[s.id], [k]: ev.target.value } }));
              return (
                <tr key={s.id} style={{ opacity: s.archived ? 0.55 : 1 }}>
                  <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                    <button style={S.iconBtn} disabled={!!busy || i === 0} onClick={() => move(i, -1)} title="Выше"><ArrowUp size={14} /></button>
                    <button style={S.iconBtn} disabled={!!busy || i === sections.length - 1} onClick={() => move(i, 1)} title="Ниже"><ArrowDown size={14} /></button>
                  </td>
                  <td style={S.td}>
                    <input className="text-input" value={e.name ?? ""} onChange={set("name")} style={{ width: "100%", minWidth: 240 }} />
                    {s.archived && <div style={{ ...T.small, fontSize: 11 }}>в архиве — не предлагается при добавлении</div>}
                  </td>
                  <td style={S.td}><DirSelect value={e.direction ?? "in"} onChange={set("direction")} /></td>
                  <td style={S.td}>
                    <input className="text-input" value={e.counterparty_label ?? ""} onChange={set("counterparty_label")}
                      placeholder={(e.direction ?? s.direction) === "out" ? "Куда" : "Откуда"} style={{ width: 150 }} />
                  </td>
                  <td style={{ ...S.td, ...S.num }}>{s.tx_count}</td>
                  <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                    <button style={{ ...S.iconBtn, color: changed(s) ? T.blue : T.faint }} disabled={!changed(s) || !!busy} onClick={() => save(s)} title="Сохранить">
                      {busy === s.id ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
                    </button>
                    <button style={S.iconBtn} disabled={!!busy} title={s.archived ? "Вернуть из архива" : "В архив (скрыть из формы, история останется)"}
                      onClick={() => run(s.id, () => updateSection(s.id, { archived: !s.archived }), s.archived ? "Раздел возвращён" : "Раздел в архиве")}>
                      {s.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                    <button style={{ ...S.iconBtn, color: T.red }} disabled={!!busy} onClick={() => remove(s)} title="Удалить"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: T.bg }}>
              <td style={{ ...S.td, ...T.small }}>Новый</td>
              <td style={S.td}>
                <input className="text-input" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })}
                  placeholder="Например: Пополнения из банков" style={{ width: "100%", minWidth: 240 }}
                  onKeyDown={(e) => e.key === "Enter" && add()} />
              </td>
              <td style={S.td}><DirSelect value={nw.direction} onChange={(e) => setNw({ ...nw, direction: e.target.value })} /></td>
              <td style={S.td}>
                <input className="text-input" value={nw.counterparty_label} onChange={(e) => setNw({ ...nw, counterparty_label: e.target.value })}
                  placeholder={nw.direction === "out" ? "Куда" : "Откуда"} style={{ width: 150 }} />
              </td>
              <td style={S.td} />
              <td style={S.td}>
                <button className="btn" onClick={add} disabled={!!busy} style={{ padding: "6px 12px" }}>
                  {busy === "new" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />} Добавить
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {delFor && (
        <div style={{ marginTop: 14, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13 }}>
          <div style={{ color: T.red, fontWeight: 600, marginBottom: 8 }}>
            В разделе «{delFor.name}» {delFor.tx_count} транзакций. Чтобы удалить раздел, перенесите их в другой:
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select className="text-input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ minWidth: 280 }}>
              <option value="">— выберите раздел —</option>
              {sections.filter((s) => s.id !== delFor.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn" onClick={confirmMove} disabled={!!busy} style={{ background: "#ef4444", borderColor: "#ef4444" }}>Перенести и удалить</button>
            <button className="btn-secondary" onClick={() => setDelFor(null)}>Отмена</button>
            <span style={T.small}>Если раздел больше не нужен, но историю удалять не хочется — лучше отправить его в архив.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
