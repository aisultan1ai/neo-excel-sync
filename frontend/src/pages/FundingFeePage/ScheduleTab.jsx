import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { Modal, Pill, SectionTitle } from "./ui";
import { fmtDate, WEEKDAYS, T, S } from "./helpers";
import { getSchedules, saveSchedule, deleteSchedule } from "./api";

export default function ScheduleTab({ accounts }) {
  const [schedules, setSchedules] = useState([]);
  const [editRow,   setEditRow]   = useState(null);
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await getSchedules(); setSchedules(data || []); }
    catch { toast.error("Ошибка загрузки расписаний"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const schedMap = Object.fromEntries(schedules.map((s) => [String(s.ff_account_id), s]));

  const startEdit = (acc) => {
    const ex = schedMap[String(acc.id)];
    setEditRow(ex
      ? { ff_account_id: acc.id, frequency: ex.frequency, day_of_period: ex.day_of_period, enabled: ex.enabled }
      : { ff_account_id: acc.id, frequency: "monthly", day_of_period: 1, enabled: true });
  };

  const save = async () => {
    if (!editRow) return; setSaving(true);
    try {
      await saveSchedule(editRow.ff_account_id, editRow);
      toast.success("Расписание сохранено");
      setEditRow(null);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Ошибка"); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Удалить расписание?")) return;
    try { await deleteSchedule(id); toast.success("Удалено"); load(); }
    catch { toast.error("Ошибка"); }
  };

  const dayLabel = (freq, d) => freq === "weekly" ? WEEKDAYS[d] || d : `${d}-е число`;

  return (
    <div className="card">
      <SectionTitle>Автоматический Cash In / Out по расписанию</SectionTitle>
      <p style={{ ...T.small, marginBottom: 16 }}>
        Проверка ежедневно в 09:00 UTC. За <strong>месяц</strong> — берётся итог прошлого месяца, за <strong>неделю</strong> — прошедшие 7 дней.
        Положительный итог → Cash In, отрицательный → Cash Out.
      </p>

      {accounts.length === 0 ? <div style={S.empty}><p style={{ color: T.faint, margin: 0 }}>Нет аккаунтов.</p></div> : (
        <div className="result-table-wrapper">
          <table className="styled-table">
            <thead>
              <tr><th>Аккаунт</th><th>Частота</th><th>День</th><th>Статус</th><th>Последний запуск</th><th style={{ width: 120 }}>Действия</th></tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const s = schedMap[String(acc.id)];
                return (
                  <tr key={acc.id}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{acc.name}</td>
                    <td style={{ fontSize: 13 }}>{s ? (s.frequency === "monthly" ? "Ежемесячно" : "Еженедельно") : "—"}</td>
                    <td style={{ fontSize: 13 }}>{s ? dayLabel(s.frequency, s.day_of_period) : "—"}</td>
                    <td>{s ? <Pill color={s.enabled ? "#dcfce7" : "#f1f5f9"} text={s.enabled ? "#15803d" : T.faint}>{s.enabled ? "Активно" : "Отключено"}</Pill> : <span style={T.small}>не настроено</span>}</td>
                    <td style={T.small}>{s ? fmtDate(s.last_run_date) : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => startEdit(acc)}>{s ? "Изменить" : "Настроить"}</button>
                        {s && <button style={{ ...S.iconBtn, color: T.red }} onClick={() => del(acc.id)}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <Modal title={`Расписание — ${accounts.find((a) => a.id === editRow.ff_account_id)?.name}`} onClose={() => setEditRow(null)} width={400}>
          <div style={{ padding: "20px 24px 24px" }}>
            <div className="input-group" style={{ marginBottom: 14 }}>
              <label className="input-label">Частота</label>
              <div style={{ position: "relative" }}>
                <select className="text-input" value={editRow.frequency}
                  onChange={(e) => setEditRow((p) => ({ ...p, frequency: e.target.value, day_of_period: 1 }))}
                  style={{ appearance: "none", paddingRight: 32 }}>
                  <option value="monthly">Ежемесячно</option>
                  <option value="weekly">Еженедельно</option>
                </select>
                <ChevronDown size={15} style={S.chev} />
              </div>
            </div>
            <div className="input-group" style={{ marginBottom: 14 }}>
              <label className="input-label">{editRow.frequency === "monthly" ? "День месяца (1–28)" : "День недели"}</label>
              {editRow.frequency === "monthly" ? (
                <input className="text-input" type="number" min={1} max={28} value={editRow.day_of_period}
                  onChange={(e) => setEditRow((p) => ({ ...p, day_of_period: parseInt(e.target.value) || 1 }))} />
              ) : (
                <div style={{ position: "relative" }}>
                  <select className="text-input" value={editRow.day_of_period}
                    onChange={(e) => setEditRow((p) => ({ ...p, day_of_period: parseInt(e.target.value) }))}
                    style={{ appearance: "none", paddingRight: 32 }}>
                    {[1,2,3,4,5,6,7].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                  </select>
                  <ChevronDown size={15} style={S.chev} />
                </div>
              )}
            </div>
            <div className="input-group" style={{ marginBottom: 20 }}>
              <label className="input-label">Статус</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={editRow.enabled} onChange={(e) => setEditRow((p) => ({ ...p, enabled: e.target.checked }))} />
                <span style={{ fontSize: 13 }}>Активно</span>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.ghost} onClick={() => setEditRow(null)}>Отмена</button>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Сохранить"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
