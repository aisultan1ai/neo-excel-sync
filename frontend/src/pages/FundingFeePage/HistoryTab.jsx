import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ChevronDown, DollarSign, Loader2, RefreshCw, Send } from "lucide-react";
import { Label, PeriodStrip, SectionTitle, StatusPill, TxPill } from "./ui";
import { fmt8, fmtDate, fmtDT, todayStr, T, S } from "./helpers";
import { getSummary, sendCashout, getHistory, getMapping } from "./api";
import ConfirmCashModal from "./ConfirmCashModal";

// ─── Manual Cash Card ─────────────────────────────────────────────────────────

function ManualCashCard({ accounts, onSent }) {
  const [form, setForm] = useState({
    ff_account_id: "", start_date: "", end_date: "",
    amount: "", netting_date: todayStr(), comment: "", internal_comment: "",
  });
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcDone,    setCalcDone]    = useState(false);
  const [confirm,     setConfirm]     = useState(null);
  const [sending,     setSending]     = useState(false);
  const [mapping,     setMapping]     = useState(null);
  const sendingRef = useRef(false);

  const handle = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (["ff_account_id", "start_date", "end_date"].includes(name)) {
      setCalcDone(false);
      setForm((p) => ({ ...p, [name]: value, amount: "" }));
    }
  };

  useEffect(() => {
    if (!form.ff_account_id) { setMapping(null); return; }
    getMapping(form.ff_account_id)
      .then(({ data }) => setMapping(data?.unity_account_id ? data : null))
      .catch(() => setMapping(null));
  }, [form.ff_account_id]);

  const calculate = async () => {
    if (!form.ff_account_id) { toast.warn("Выберите аккаунт"); return; }
    setCalcLoading(true);
    try {
      const params = { account_id: form.ff_account_id };
      if (form.start_date) params.start_date = form.start_date;
      if (form.end_date)   params.end_date   = form.end_date;
      const { data } = await getSummary(params);
      const accName = accounts.find((a) => String(a.id) === String(form.ff_account_id))?.name || form.ff_account_id;
      setForm((p) => ({
        ...p,
        amount:  String(data.grand_total.toFixed(8)),
        comment: `Funding fee_${accName}_${form.start_date || ""}_${form.end_date || ""}_neoapi`,
      }));
      setCalcDone(true);
      if (data.grand_total === 0) toast.warn("Сумма за период равна 0");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка расчёта");
    } finally {
      setCalcLoading(false);
    }
  };

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.ff_account_id) { toast.warn("Выберите аккаунт"); return; }
    const amt = parseFloat(form.amount);
    if (!amt || amt === 0) { toast.error("Сумма не может быть 0"); return; }
    if (!form.netting_date) { toast.error("Укажите дату транзакции"); return; }
    setConfirm({ ...form, amount: amt });
  };

  const doSend = async () => {
    if (!confirm || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const { data } = await sendCashout({
        ff_account_id:    parseInt(confirm.ff_account_id),
        amount:           confirm.amount,
        netting_date:     confirm.netting_date,
        start_date:       confirm.start_date       || null,
        end_date:         confirm.end_date         || null,
        comment:          confirm.comment          || null,
        internal_comment: confirm.internal_comment || null,
      });
      const lbl = data.transaction_type === "cashin" ? "Cash In" : "Cash Out";
      toast.success(`${lbl} отправлен! TxID: ${data.transaction_id}`);
      setForm((p) => ({ ...p, amount: "", comment: "", internal_comment: "", netting_date: todayStr() }));
      setCalcDone(false);
      setConfirm(null);
      onSent();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка отправки");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const amt    = parseFloat(form.amount || 0);
  const isIn   = amt > 0;
  const isOut  = amt < 0;
  const selAcc = accounts.find((a) => String(a.id) === String(form.ff_account_id));

  return (
    <div className="card">
      <SectionTitle>
        <Send size={13} style={{ marginRight: 8, display: "inline", verticalAlign: "middle", color: "#8b5cf6" }} />
        Unity Cash In / Cash Out
      </SectionTitle>

      <form onSubmit={openConfirm}>
        <PeriodStrip onSelect={(s, e) => { setForm((p) => ({ ...p, start_date: s, end_date: e, amount: "" })); setCalcDone(false); }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 200px", minWidth: 180 }}>
            <Label>Binance аккаунт</Label>
            <div style={{ position: "relative", marginTop: 6 }}>
              <select className="text-input" name="ff_account_id" value={form.ff_account_id} onChange={handle}
                style={{ appearance: "none", paddingRight: 32 }}>
                <option value="">- выберите аккаунт -</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown size={15} style={S.chev} />
            </div>
          </div>
          <div style={{ flex: "1 1 140px", minWidth: 130 }}>
            <Label>Период с</Label>
            <input type="date" className="text-input" name="start_date" value={form.start_date} onChange={handle} style={{ marginTop: 6 }} />
          </div>
          <div style={{ flex: "1 1 140px", minWidth: 130 }}>
            <Label>Период по</Label>
            <input type="date" className="text-input" name="end_date" value={form.end_date} onChange={handle} style={{ marginTop: 6 }} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <button type="button" className="btn" onClick={calculate}
              disabled={calcLoading || !form.ff_account_id} style={{ backgroundColor: "#0ea5e9" }}>
              {calcLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 5 }} /> : <DollarSign size={14} style={{ marginRight: 5 }} />}
              Рассчитать
            </button>
          </div>
        </div>

        {calcDone && (
          <div style={{ background: isIn ? "#f0fdf4" : isOut ? "#fef2f2" : T.bg, border: `1px solid ${isIn ? "#bbf7d0" : isOut ? "#fecaca" : T.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...T.small, marginBottom: 4 }}>{selAcc?.name} · {form.start_date} - {form.end_date}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: isIn ? T.green : isOut ? T.red : T.muted }}>
                  {fmt8(amt)} USDT
                </span>
                {(isIn || isOut) && <TxPill t={isIn ? "cashin" : "cashout"} />}
              </div>
            </div>
            <div style={{ ...T.small, textAlign: "right", lineHeight: 1.6 }}>
              {isIn  && <strong style={{ color: T.green }}>Cash In</strong>}
              {isOut && <strong style={{ color: T.red }}>Cash Out</strong>}
              {!isIn && !isOut && "Сумма = 0"}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: "2 1 180px" }}>
            <Label>Сумма USDT</Label>
            <input className="text-input" type="number" name="amount" step="0.00000001" value={form.amount}
              onChange={handle} placeholder="Введите вручную или нажмите Рассчитать" style={{ marginTop: 6 }} />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <Label>Дата транзакции (nettingDate)</Label>
            <input type="date" className="text-input" name="netting_date" value={form.netting_date} onChange={handle} style={{ marginTop: 6 }} />
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: "1 1 220px" }}>
            <Label>Комментарий</Label>
            <input className="text-input" name="comment" placeholder="необязательно" value={form.comment} onChange={handle} style={{ marginTop: 6 }} />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <Label>Внутренний комментарий</Label>
            <input className="text-input" name="internal_comment" placeholder="необязательно" value={form.internal_comment} onChange={handle} style={{ marginTop: 6 }} />
          </div>
        </div>

        <button type="submit" className="btn"
          disabled={!form.ff_account_id || !form.amount || amt === 0}
          style={{ backgroundColor: isOut ? "#db2777" : "#8b5cf6" }}>
          <Send size={14} style={{ marginRight: 6 }} />
          {isOut ? "Отправить Cash Out" : "Отправить Cash In"}
        </button>
        {!calcDone && form.ff_account_id && (
          <span style={{ ...T.small, marginLeft: 12 }}>Нажмите «Рассчитать» чтобы подтянуть сумму из базы</span>
        )}
      </form>

      {confirm && (
        <ConfirmCashModal
          payload={confirm}
          account={selAcc}
          mapping={mapping}
          onConfirm={doSend}
          onClose={() => setConfirm(null)}
          sending={sending}
        />
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

export default function HistoryTab({ accounts, tz = 0 }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter) params.ff_account_id = filter;
      const { data } = await getHistory(params);
      setRows(data || []);
    } catch {
      toast.error("Ошибка загрузки истории");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <ManualCashCard accounts={accounts} onSent={load} />

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>История транзакций</span>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <select className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)}
                style={{ appearance: "none", paddingRight: 28, minWidth: 160 }}>
                <option value="">Все аккаунты</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown size={14} style={{ ...S.chev, right: 8 }} />
            </div>
            <button className="btn" onClick={load} disabled={loading} style={{ padding: "8px 12px" }}>
              {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={S.empty}><p style={{ color: T.faint, margin: 0 }}>История пуста.</p></div>
        ) : (
          <div className="result-table-wrapper">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Дата</th><th>Аккаунт</th><th>Тип</th><th>Период</th>
                  <th style={{ textAlign: "right" }}>Сумма</th><th>Netting Date</th>
                  <th>Статус</th><th>Transaction ID</th><th>Источник</th><th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 11, color: T.muted }}>{fmtDT(r.created_at, tz)}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.account_name || r.ff_account_id}</td>
                    <td><TxPill t={r.transaction_type} /></td>
                    <td style={{ fontSize: 12, color: T.muted }}>
                      {r.start_date && r.end_date ? `${fmtDate(r.start_date)} - ${fmtDate(r.end_date)}` : "-"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: parseFloat(r.amount) >= 0 ? T.green : T.red }}>
                      {fmt8(r.amount)}
                    </td>
                    <td style={{ fontSize: 12, color: T.muted }}>{fmtDate(r.netting_date)}</td>
                    <td><StatusPill s={r.status} /></td>
                    <td style={{ fontSize: 11, fontFamily: "monospace", color: "#475569" }}>
                      {r.transaction_id || (r.status === "error" ? <span style={{ color: T.red, fontSize: 11 }}>{r.error_message?.slice(0, 50)}</span> : "-")}
                    </td>
                    <td style={{ fontSize: 12, color: T.muted }}>{r.triggered_by}</td>
                    <td style={{ fontSize: 12, color: T.muted }}>{r.comment || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
