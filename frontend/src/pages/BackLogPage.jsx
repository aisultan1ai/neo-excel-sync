import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { RefreshCw, Loader2, ChevronDown } from "lucide-react";


const ACTION_META = {
  account_add:     { label: "Добавлен счёт",        bg: "#dcfce7", color: "#15803d" },
  account_delete:  { label: "Удалён счёт",           bg: "#fee2e2", color: "#dc2626" },
  records_load:    { label: "Загрузка данных",        bg: "#dbeafe", color: "#1d4ed8" },
  records_delete:  { label: "Удаление данных",        bg: "#fef9c3", color: "#a16207" },
  cashout_send:    { label: "Транзакция отправлена",  bg: "#f3e8ff", color: "#7c3aed" },
  schedule_upsert: { label: "Расписание настроено",   bg: "#e0f2fe", color: "#0369a1" },
  schedule_delete: { label: "Расписание удалено",     bg: "#fef3c7", color: "#b45309" },
  settings_update: { label: "Настройки Unity API",   bg: "#f0fdf4", color: "#16a34a" },
  mapping_update:  { label: "Маппинг обновлён",      bg: "#fdf4ff", color: "#9333ea" },
};

const ACTIONS = Object.entries(ACTION_META).map(([k, v]) => ({ value: k, label: v.label }));

const ActionPill = ({ action }) => {
  const m = ACTION_META[action] || { label: action, bg: "#f1f5f9", color: "#64748b" };
  return (
    <span style={{ background: m.bg, color: m.color, borderRadius: 100, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
};

const fmtDT = (v) => {
  if (!v) return "—";
  const s = String(v).replace(" ", "T");
  const norm = /[Zz]|[+\-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z";
  const d = new Date(norm);
  if (isNaN(d.getTime())) return s.slice(0, 19).replace("T", " ");
  return d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", hour12: false }).replace(",", "");
};

const DetailView = ({ details }) => {
  if (!details) return <span style={{ color: "#94a3b8" }}>—</span>;
  const obj = typeof details === "string" ? JSON.parse(details) : details;
  return (
    <div style={{ fontSize: 11, lineHeight: 1.7, color: "#475569" }}>
      {Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k}>
          <span style={{ color: "#94a3b8", marginRight: 4 }}>{k}:</span>
          <span style={{ fontWeight: 500 }}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
};

export default function BackLogPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [users,   setUsers]   = useState([]);

  const [filterAction,    setFilterAction]    = useState("");
  const [filterUser,      setFilterUser]      = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate,   setFilterEndDate]   = useState("");

  useEffect(() => {
    axios.get("/api/v1/ff/admin/users", {})
      .then(({ data }) => setUsers(data || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (filterAction)    params.action     = filterAction;
      if (filterUser)      params.user_id    = filterUser;
      if (filterStartDate) params.start_date = filterStartDate;
      if (filterEndDate)   params.end_date   = filterEndDate;
      const { data } = await axios.get("/api/v1/ff/admin/backlog", { params });
      setRows(data || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterUser, filterStartDate, filterEndDate]);

  useEffect(() => { load(); }, [load]);

  const sel = { appearance: "none", paddingRight: 28, fontSize: 13, height: 36, border: "1px solid #e2e8f0", borderRadius: 8, padding: "0 28px 0 10px", background: "#fff", cursor: "pointer", color: "#334155" };
  const inp = { fontSize: 13, height: 36, border: "1px solid #e2e8f0", borderRadius: 8, padding: "0 10px", color: "#334155" };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "0 4px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.02em" }}>BackLog</h1>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>Журнал действий · Funding Fee · только для администратора</p>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ position: "relative" }}>
          <select style={sel} value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
            <option value="">Все действия</option>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#94a3b8" }} />
        </div>
        <div style={{ position: "relative" }}>
          <select style={sel} value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
            <option value="">Все пользователи</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#94a3b8" }} />
        </div>
        <input type="date" style={inp} value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
        <input type="date" style={inp} value={filterEndDate}   onChange={(e) => setFilterEndDate(e.target.value)} />
        <button
          onClick={load} disabled={loading}
          style={{ height: 36, padding: "0 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
          Обновить
        </button>
        {(filterAction || filterUser || filterStartDate || filterEndDate) && (
          <button
            onClick={() => { setFilterAction(""); setFilterUser(""); setFilterStartDate(""); setFilterEndDate(""); }}
            style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "transparent", fontSize: 13, color: "#64748b", cursor: "pointer" }}>
            Сбросить
          </button>
        )}
        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{rows.length} записей</span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8", fontSize: 14 }}>
            {loading ? "Загрузка..." : "Нет записей"}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  {["Дата / Время", "Пользователь", "Действие", "Детали"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#64748b", fontSize: 12 }}>{fmtDT(r.created_at)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1e293b" }}>{r.username}</td>
                    <td style={{ padding: "10px 14px" }}><ActionPill action={r.action} /></td>
                    <td style={{ padding: "10px 14px", maxWidth: 420 }}><DetailView details={r.details} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
