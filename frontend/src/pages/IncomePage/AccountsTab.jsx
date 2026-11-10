import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Ban, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import { addAccounts, listAccounts, updateAccounts } from "./api";
import { S, T, errText } from "./helpers";
import { SearchBox } from "./ui";

const LIMIT = 500;

const autoRole = (a) => ((a.accounting_type || "").toUpperCase() === "REAL" ? "provider" : "client");
const roleOf = (a) => a.role || autoRole(a);

const ROLE_LABEL = { client: "Клиент", provider: "Провайдер" };

export default function AccountsTab() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState("");
  const [roleF, setRoleF]       = useState("all");
  const [exclF, setExclF]       = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [provider, setProvider] = useState("");
  const [profile, setProfile]   = useState("");
  const [busy, setBusy]         = useState(false);
  const [newIds, setNewIds]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listAccounts();
      setRows(data || []);
    } catch { toast.error("Ошибка загрузки счетов"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (roleF !== "all" && roleOf(a) !== roleF) return false;
      if (exclF === "excluded" && !a.excluded) return false;
      if (exclF === "active" && a.excluded) return false;
      if (!s) return true;
      return [a.account_id, a.name, a.client_profile_name, a.provider_label, a.profile_label, a.accounting_type, a.management_type]
        .some((v) => String(v ?? "").toLowerCase().includes(s));
    });
  }, [rows, q, roleF, exclF]);

  const visible = filtered.slice(0, LIMIT);
  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.account_id));

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allVisibleSelected) visible.forEach((a) => n.delete(a.account_id));
    else visible.forEach((a) => n.add(a.account_id));
    return n;
  });

  const apply = async (changes, ids = [...selected]) => {
    if (!ids.length) { toast.warn("Выберите счета"); return; }
    setBusy(true);
    try {
      const { data } = await updateAccounts(ids, changes);
      toast.success(`Обновлено счетов: ${data.updated}`);
      await load();
    } catch (err) { toast.error(errText(err, "Ошибка сохранения")); }
    finally { setBusy(false); }
  };

  const handleAdd = async () => {
    const ids = [...new Set(newIds.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
    if (!ids.length || !ids.every((x) => /^\d+$/.test(x))) { toast.warn("Укажите ID счетов через запятую или пробел"); return; }
    setBusy(true);
    try {
      await addAccounts(ids.map(Number));
      await updateAccounts(ids.map(Number), { excluded: true });
      toast.success(`Исключено из загрузки: ${ids.length}`);
      setNewIds("");
      await load();
    } catch (err) { toast.error(errText(err, "Ошибка")); }
    finally { setBusy(false); }
  };

  const counts = useMemo(() => ({
    total: rows.length,
    provider: rows.filter((a) => roleOf(a) === "provider").length,
    excluded: rows.filter((a) => a.excluded).length,
  }), [rows]);

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ ...T.small, marginBottom: 10, lineHeight: 1.6 }}>
          Справочник счетов обновляется при каждой загрузке из Unity, ручные поля не перезаписываются.<br />
          <b>Роль</b>: клиентские счета дают доход, счета провайдера — для сравнения (комиссия и курс провайдера). Авто: accountingType = REAL → провайдер.<br />
          <b>Провайдер</b> — подпись для отчёта (EXANTE, FINALTO, Binance…). Для сделки берётся провайдер счёта, где нашлась парная сделка, иначе — провайдер клиентского счёта.<br />
          <b>Исключённые</b> счета не запрашиваются из Unity вовсе — для счетов с огромным числом ненужных сделок.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">Исключить по ID (до первой загрузки)</label>
            <input className="text-input" value={newIds} onChange={(e) => setNewIds(e.target.value)}
              placeholder="12345, 67890" style={{ width: 260 }} />
          </div>
          <button style={S.ghost} onClick={handleAdd} disabled={busy}><Plus size={14} /> Исключить</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <SearchBox value={q} onChange={setQ} placeholder="ID, имя, профиль, провайдер" width={260} />
          <select className="text-input" value={roleF} onChange={(e) => setRoleF(e.target.value)} style={{ width: 150 }}>
            <option value="all">Все роли</option>
            <option value="client">Клиенты</option>
            <option value="provider">Провайдеры</option>
          </select>
          <select className="text-input" value={exclF} onChange={(e) => setExclF(e.target.value)} style={{ width: 170 }}>
            <option value="all">Все счета</option>
            <option value="active">Загружаемые</option>
            <option value="excluded">Исключённые</option>
          </select>
          <button style={S.ghost} onClick={load} disabled={loading}><RefreshCw size={14} /> Обновить</button>
          <span style={T.small}>
            Всего {counts.total} · провайдеров {counts.provider} · исключено {counts.excluded}
            {filtered.length > LIMIT ? ` · показаны первые ${LIMIT} из ${filtered.length}` : ""}
          </span>
        </div>

        {/* Массовые действия */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", background: T.bg, borderRadius: 8, marginBottom: 12 }}>
          <b style={{ fontSize: 12, color: T.ink }}>Выбрано: {selected.size}</b>
          <button style={S.ghost} disabled={busy} onClick={() => apply({ role: "client" })}>Клиент</button>
          <button style={S.ghost} disabled={busy} onClick={() => apply({ role: "provider" })}>Провайдер</button>
          <button style={S.ghost} disabled={busy} onClick={() => apply({ role: null })}>Роль авто</button>
          <button style={{ ...S.ghost, color: T.red }} disabled={busy} onClick={() => apply({ excluded: true })}><Ban size={14} /> Исключить</button>
          <button style={{ ...S.ghost, color: T.green }} disabled={busy} onClick={() => apply({ excluded: false })}><CheckCircle2 size={14} /> Вернуть</button>
          <input className="text-input" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Провайдер" style={{ width: 140 }} />
          <button style={S.ghost} disabled={busy} onClick={() => apply({ provider_label: provider })}>Задать провайдера</button>
          <input className="text-input" value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="Профиль (вместо Unity)" style={{ width: 190 }} />
          <button style={S.ghost} disabled={busy} onClick={() => apply({ profile_label: profile })}>Задать профиль</button>
          {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
          {selected.size > 0 && <button style={{ ...S.ghost, border: "none", background: "transparent" }} onClick={() => setSelected(new Set())}>Снять выбор</button>}
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: "center" }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : !rows.length ? (
          <div style={S.empty}><span style={{ color: T.faint, fontSize: 13 }}>Счетов пока нет — они появятся после первой загрузки из Unity.</span></div>
        ) : (
          <div style={{ maxHeight: 600, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={S.th}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>
                  {["ID", "Имя", "Профиль Unity", "Профиль (ручн.)", "Роль", "Провайдер", "Accounting", "Management", "Статус", ""].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.account_id} style={{ opacity: a.excluded ? 0.5 : 1, background: selected.has(a.account_id) ? "#eff6ff" : undefined }}>
                    <td style={S.td}><input type="checkbox" checked={selected.has(a.account_id)} onChange={() => toggle(a.account_id)} /></td>
                    <td style={{ ...S.td, fontVariantNumeric: "tabular-nums" }}>{a.account_id}</td>
                    <td style={S.td}>{a.name || "—"}</td>
                    <td style={S.td}>{a.client_profile_name || "—"}</td>
                    <td style={S.td}>{a.profile_label || ""}</td>
                    <td style={S.td}>
                      {ROLE_LABEL[roleOf(a)]}{!a.role && <span style={{ color: T.faint, fontSize: 11 }}> (авто)</span>}
                    </td>
                    <td style={S.td}>{a.provider_label || ""}</td>
                    <td style={{ ...S.td, ...T.small }}>{a.accounting_type || ""}</td>
                    <td style={{ ...S.td, ...T.small }}>{a.management_type || ""}</td>
                    <td style={{ ...S.td, ...T.small }}>{a.status || ""}</td>
                    <td style={S.td}>
                      <button title={a.excluded ? "Вернуть в загрузку" : "Исключить из загрузки"}
                        onClick={() => apply({ excluded: !a.excluded }, [a.account_id])}
                        style={{ background: "none", border: "none", cursor: "pointer", color: a.excluded ? T.green : T.red, display: "flex" }}>
                        {a.excluded ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
