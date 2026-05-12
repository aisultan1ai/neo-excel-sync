import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ChevronDown, Download, Eye, Loader2, RefreshCw, TrendingDown, TrendingUp, X } from "lucide-react";
import { Label, PeriodStrip, SectionTitle, Pill } from "./ui";
import { fmt, fmt8, fmtDate, fmtDT, T, S } from "./helpers";
import { getSummary, getRecords, exportExcel, deleteRecords, getSymbols, loadStream } from "./api";

export default function DataTab({ accounts, selAccountId, onSelect, onAccountsRefresh, tz = 0 }) {
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const [selSymbol,    setSelSymbol]    = useState("");
  const [availSymbols, setAvailSymbols] = useState([]);
  const [loadingSymbols, setLoadingSymbols] = useState(false);
  const [summary,      setSummary]      = useState(null);
  const [records,      setRecords]      = useState([]);
  const [loadingData,  setLoadingData]  = useState(false);
  const [streaming,    setStreaming]    = useState(false);
  const [streamMsg,    setStreamMsg]    = useState("");
  const [streamN,      setStreamN]      = useState(0);
  const abortRef = useRef(null);

  const selAcc = accounts.find((a) => String(a.id) === String(selAccountId));

  useEffect(() => {
    if (!selAccountId) { setAvailSymbols([]); setSelSymbol(""); return; }
    setLoadingSymbols(true);
    getSymbols(selAccountId)
      .then(({ data }) => setAvailSymbols(data.symbols || []))
      .catch(() => setAvailSymbols([]))
      .finally(() => setLoadingSymbols(false));
  }, [selAccountId]);

  const loadData = useCallback(async () => {
    if (!selAccountId) { toast.warn("Выберите аккаунт"); return; }
    setLoadingData(true); setSummary(null); setRecords([]);
    try {
      const params = { account_id: selAccountId };
      if (startDate) params.start_date = startDate;
      if (endDate)   params.end_date   = endDate;
      if (selSymbol) params.symbol     = selSymbol;
      const [sumRes, recRes] = await Promise.all([
        getSummary(params),
        getRecords({ ...params, limit: 500 }),
      ]);
      setSummary(sumRes.data);
      setRecords(recRes.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoadingData(false);
    }
  }, [selAccountId, startDate, endDate, selSymbol]);

  const streamLoad = async () => {
    if (!selAccountId) { toast.warn("Выберите аккаунт"); return; }
    setStreaming(true); setStreamMsg("Подключение..."); setStreamN(0);
    const payload = { account_id: Number(selAccountId) };
    if (startDate) payload.start_date = startDate;
    if (endDate)   payload.end_date   = endDate;
    if (selSymbol) payload.symbol     = selSymbol;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const resp = await loadStream(payload, localStorage.getItem("token"), ctrl.signal);
      if (!resp.ok) throw new Error(await resp.text());
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const e = JSON.parse(line.slice(6));
            if (e.status === "loading")  { setStreamN(e.fetched); setStreamMsg(`Загружено: ${e.fetched} записей`); }
            else if (e.status === "saving") setStreamMsg(`Сохранение ${e.fetched} записей...`);
            else if (e.status === "done") {
              toast.success(`Готово: ${e.fetched} загружено, ${e.new_saved} новых`);
              setStreaming(false);
              onAccountsRefresh();
              await loadData();
              return;
            } else if (e.status === "error") {
              toast.error(e.message);
              setStreaming(false);
              return;
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") toast.error("Ошибка соединения");
    } finally {
      setStreaming(false);
    }
  };

  const handleExport = async () => {
    if (!selAccountId) { toast.warn("Выберите аккаунт"); return; }
    const p = new URLSearchParams({ account_id: selAccountId });
    if (startDate) p.set("start_date", startDate);
    if (endDate)   p.set("end_date",   endDate);
    if (selSymbol) p.set("symbol",     selSymbol);
    try {
      const resp = await exportExcel(p.toString());
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `funding_fee_${selAccountId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch {
      toast.error("Ошибка экспорта");
    }
  };

  const handleDelete = async () => {
    if (!selAccountId) return;
    const acc = accounts.find((a) => String(a.id) === String(selAccountId));
    if (!window.confirm(`Удалить записи "${acc?.name}"?`)) return;
    const p = new URLSearchParams({ account_id: selAccountId });
    if (startDate) p.set("start_date", startDate);
    if (endDate)   p.set("end_date",   endDate);
    if (selSymbol) p.set("symbol",     selSymbol);
    try {
      const { data } = await deleteRecords(p.toString());
      toast.success(`Удалено: ${data.deleted} записей`);
      setSummary(null);
      setRecords([]);
      onAccountsRefresh();
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const grandPos = summary && summary.grand_total >= 0;

  return (
    <div className="card">
      <SectionTitle>Анализ данных</SectionTitle>

      <PeriodStrip onSelect={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: "2 1 200px", minWidth: 180 }}>
          <Label>Аккаунт</Label>
          <div style={{ position: "relative", marginTop: 6 }}>
            <select className="text-input" value={selAccountId}
              onChange={(e) => { onSelect(e.target.value); setSummary(null); setRecords([]); }}
              style={{ appearance: "none", paddingRight: 32 }}>
              <option value="">- выберите аккаунт -</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ChevronDown size={15} style={S.chev} />
          </div>
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 130 }}>
          <Label>Дата с</Label>
          <input type="date" className="text-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ marginTop: 6 }} />
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 130 }}>
          <Label>Дата по</Label>
          <input type="date" className="text-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ marginTop: 6 }} />
        </div>
        <div style={{ flex: "1 1 160px", minWidth: 150 }}>
          <Label>Символ {loadingSymbols && <Loader2 size={11} style={{ display: "inline", animation: "spin 1s linear infinite" }} />}</Label>
          <div style={{ position: "relative", marginTop: 6 }}>
            <select className="text-input" value={selSymbol} onChange={(e) => setSelSymbol(e.target.value)}
              disabled={!selAccountId} style={{ appearance: "none", paddingRight: 32 }}>
              <option value="">Все символы</option>
              {availSymbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={15} style={S.chev} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
        <button className="btn"
          onClick={streaming ? () => { abortRef.current?.abort(); setStreaming(false); } : streamLoad}
          disabled={!selAccountId}
          style={streaming ? { backgroundColor: "#ef4444" } : {}}>
          {streaming
            ? <><X size={14} style={{ marginRight: 5 }} />Отменить</>
            : <><RefreshCw size={14} style={{ marginRight: 5 }} />Загрузить с Binance</>}
        </button>
        <button className="btn" onClick={loadData} disabled={!selAccountId || loadingData} style={{ backgroundColor: "#0ea5e9" }}>
          {loadingData ? <Loader2 size={14} style={{ marginRight: 5, animation: "spin 1s linear infinite" }} /> : <Eye size={14} style={{ marginRight: 5 }} />}
          Показать данные
        </button>
        <button className="btn" onClick={handleExport} disabled={!selAccountId} style={{ backgroundColor: "#10b981" }}>
          <Download size={14} style={{ marginRight: 5 }} />Экспорт Excel
        </button>
        <button onClick={handleDelete} disabled={!selAccountId} style={{ ...S.dangerBtn, opacity: selAccountId ? 1 : 0.45 }}>
          Удалить записи
        </button>
      </div>

      {streaming && (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "#3b82f6", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{streamMsg}</span>
          </div>
          {streamN > 0 && (
            <div style={{ height: 4, background: "#e0f2fe", borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, streamN / 50)}%`, background: "#3b82f6", borderRadius: 2, transition: "width 0.3s" }} />
            </div>
          )}
        </div>
      )}

      {summary && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ flex: "1 1 220px", background: T.bg, border: `2px solid ${grandPos ? "#bbf7d0" : "#fecaca"}`, borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ ...T.label, marginBottom: 8 }}>Итого за период</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {grandPos ? <TrendingUp size={20} style={{ color: T.green }} /> : <TrendingDown size={20} style={{ color: T.red }} />}
                <span style={{ fontSize: 24, fontWeight: 700, color: grandPos ? T.green : T.red }}>{fmt8(summary.grand_total)}</span>
                <span style={{ fontSize: 13, color: T.muted }}>USDT</span>
              </div>
              {selAcc && <div style={{ ...T.small, marginTop: 4 }}>{selAcc.name}</div>}
            </div>
            <div style={{ flex: "1 1 200px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ ...T.label, marginBottom: 8 }}>Параметры</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{startDate} → {endDate}</div>
              {selSymbol && <div style={{ marginTop: 4 }}><Pill color="#eff6ff" text="#1d4ed8">{selSymbol}</Pill></div>}
              <div style={{ ...T.small, marginTop: 6 }}>{summary.total_records} записей</div>
            </div>
          </div>

          {summary.by_symbol.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Label style={{ display: "block", marginBottom: 10 }}>По символам</Label>
              <div className="result-table-wrapper">
                <table className="styled-table">
                  <thead><tr><th>Символ</th><th>Asset</th><th style={{ textAlign: "right" }}>Итого</th><th style={{ textAlign: "right" }}>Записей</th></tr></thead>
                  <tbody>
                    {summary.by_symbol.map((row, i) => {
                      const p = row.total >= 0;
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{row.symbol}</td>
                          <td style={{ fontSize: 13 }}>{row.asset}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: p ? T.green : T.red }}>{p ? "+" : ""}{fmt8(row.total)}</td>
                          <td style={{ textAlign: "right", fontSize: 13, color: T.muted }}>{row.count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {records.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Label>Записи ({records.length})</Label>
            {records.length >= 500 && <span style={T.small}>Показаны последние 500</span>}
          </div>
          <div className="result-table-wrapper" style={{ maxHeight: 380, overflowY: "auto" }}>
            <table className="styled-table">
              <thead><tr><th>Дата</th><th>Символ</th><th>Asset</th><th style={{ textAlign: "right" }}>Income</th><th>{tz === 0 ? "UTC+0" : `UTC+${tz}`}</th></tr></thead>
              <tbody>
                {records.map((r, i) => {
                  const p = parseFloat(r.income) >= 0;
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: 12 }}>{fmtDate(r.date_local)}</td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{r.symbol}</td>
                      <td style={{ fontSize: 12 }}>{r.asset}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: p ? T.green : T.red }}>{p ? "+" : ""}{fmt8(r.income)}</td>
                      <td style={{ ...T.small, fontSize: 11 }}>{fmtDT(r.datetime_utc, tz)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!streaming && !loadingData && !summary && records.length === 0 && selAccountId && (
        <div style={S.empty}><p style={{ color: T.faint, margin: 0 }}>Нажмите «Загрузить с Binance» или «Показать данные».</p></div>
      )}
      {!selAccountId && (
        <div style={S.empty}><p style={{ color: T.faint, margin: 0 }}>Выберите аккаунт для начала работы.</p></div>
      )}
    </div>
  );
}
