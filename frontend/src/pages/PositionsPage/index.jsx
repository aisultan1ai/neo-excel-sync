import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { AlertTriangle, Loader2, Scale, Search, X } from "lucide-react";
import { listAccounts, reconcilePositions } from "./api";
import { STATUS, T, S, todayStr, isIssue } from "./helpers";
import { StatTile } from "./ui";
import AccountPicker from "./AccountPicker";
import AccountResult from "./AccountResult";

export default function PositionsPage() {
  const [accounts,   setAccounts]   = useState([]);
  const [selected,   setSelected]   = useState([]);
  const [from,       setFrom]       = useState("");          // пусто = с даты открытия счёта, не раньше 2023-01-01
  const [to,         setTo]         = useState(todayStr());
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [query,      setQuery]      = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await listAccounts();
      setAccounts(data || []);
    } catch { toast.error("Ошибка загрузки счетов"); }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const handleRun = async () => {
    if (!selected.length)            { toast.warn("Выберите или добавьте хотя бы один счёт"); return; }
    if (from && to && from > to)     { toast.warn("Дата «с» больше даты «по»"); return; }
    setLoading(true);
    try {
      const { data } = await reconcilePositions(selected, from, to);
      setResult(data);
      const issues = data.accounts.reduce((n, a) => n + (a.rows || []).filter(isIssue).length, 0);
      const errors = data.accounts.filter(a => a.error).length;
      if (errors)      toast.error(`Не удалось сверить счетов: ${errors}`);
      else if (issues) toast.warn(`Найдено расхождений: ${issues}`);
      else             toast.success("Все позиции сходятся");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Ошибка сверки");
    } finally { setLoading(false); }
  };

  const totals = useMemo(() => {
    if (!result) return null;
    const t = { accounts: result.accounts.length, errors: 0, withIssues: 0 };
    Object.keys(STATUS).forEach(s => { t[s] = 0; });
    result.accounts.forEach(a => {
      if (a.error) { t.errors += 1; return; }
      Object.keys(STATUS).forEach(s => { t[s] += a.summary[s] || 0; });
      if ((a.rows || []).some(isIssue)) t.withIssues += 1;
    });
    return t;
  }, [result]);

  // проблемные счета — наверх
  const sortedAccounts = useMemo(() => {
    if (!result) return [];
    const rank = a => (a.error ? 0 : (a.rows || []).some(isIssue) ? 1 : 2);
    return [...result.accounts].sort((a, b) => rank(a) - rank(b));
  }, [result]);

  const partialPeriod = !!from || (to && to < todayStr());

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Шапка */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>Сверка позиций</h1>
          <p style={{ margin: "3px 0 0", ...T.small }}>
            Unity · Позиции на счёте vs сумма DIRECT-сделок (BUY − SELL) по каждому инструменту
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
          <Scale size={15} color={T.blue} />
          <span style={{ fontSize: 12, color: T.blue, fontWeight: 600 }}>Positions Recon</span>
        </div>
      </div>

      {/* Параметры */}
      <div className="card" style={{ marginBottom: 16 }}>
        <AccountPicker accounts={accounts} selected={selected} setSelected={setSelected} onRefresh={loadAccounts} />

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">Сделки с</label>
            <div style={{ position: "relative" }}>
              <input className="text-input" type="date" value={from}
                onChange={e => setFrom(e.target.value)} style={{ width: 170, paddingRight: 30 }} />
              {from && (
                <button type="button" title="Авто: с даты открытия счёта" onClick={() => setFrom("")}
                  style={{ ...S.iconBtn, position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">По</label>
            <input className="text-input" type="date" value={to}
              onChange={e => setTo(e.target.value)} style={{ width: 150 }} />
          </div>

          <button className="btn" onClick={handleRun} disabled={loading}>
            {loading
              ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
              : <Scale size={14} style={{ marginRight: 6 }} />}
            {loading ? "Сверяю..." : "Сверить"}
          </button>
        </div>

        <div style={{ ...T.small, marginTop: 10 }}>
          Период сделок: <b style={{ color: T.ink }}>{from || "с даты открытия счёта (не ранее 01.01.2023)"}</b> — <b style={{ color: T.ink }}>{to || "сегодня"}</b>
        </div>
        {loading && (
          <div style={{ ...T.small, marginTop: 8 }}>
            Unity ограничивает частоту запросов — сверка нескольких счетов может занять 1–2 минуты.
          </div>
        )}
        {partialPeriod && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e", display: "flex", gap: 8, alignItems: "center" }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            Позиции на счёте всегда текущие. При неполном периоде сделки за его пределами не учтутся — часть расхождений будет ожидаемой.
          </div>
        )}
      </div>

      {/* Пусто до первого запуска */}
      {!result && !loading && (
        <div style={S.empty}>
          <p style={{ color: T.faint, margin: 0, fontSize: 13 }}>
            Выберите счета и нажмите «Сверить» — покажем инструменты, где позиция на счёте не совпадает со сделками.
          </p>
        </div>
      )}

      {/* Результат */}
      {result && totals && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <StatTile label="Счетов" value={totals.accounts} />
            <StatTile label="С расхождениями" value={totals.withIssues} color={totals.withIssues ? "#c2410c" : T.green} />
            <StatTile label={STATUS.MISSING.label} value={totals.MISSING} color={totals.MISSING ? STATUS.MISSING.fg : T.ink} hint={STATUS.MISSING.hint} />
            <StatTile label={STATUS.MISMATCH.label} value={totals.MISMATCH} color={totals.MISMATCH ? STATUS.MISMATCH.fg : T.ink} hint={STATUS.MISMATCH.hint} />
            <StatTile label={STATUS.UNEXPECTED.label} value={totals.UNEXPECTED} color={totals.UNEXPECTED ? STATUS.UNEXPECTED.fg : T.ink} hint={STATUS.UNEXPECTED.hint} />
            {totals.errors > 0 && <StatTile label="Ошибки API" value={totals.errors} color={T.red} />}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 2, background: T.bg, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
              {[[true, "Только расхождения"], [false, "Все инструменты"]].map(([v, label]) => (
                <button key={label} onClick={() => setOnlyIssues(v)}
                  style={{
                    padding: "6px 16px", border: "none", borderRadius: 6, cursor: "pointer",
                    fontSize: 12, fontWeight: onlyIssues === v ? 600 : 400,
                    background: onlyIssues === v ? "#fff" : "transparent",
                    color: onlyIssues === v ? T.blue : T.muted,
                    boxShadow: onlyIssues === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s",
                  }}>{label}</button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <Search size={14} color={T.faint} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input className="text-input" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Тикер, код, ISIN" style={{ paddingLeft: 30, width: 240 }} />
            </div>
            <span style={T.small}>
              Период: {result.from_date || "с даты открытия каждого счёта"} — {result.to_date}
            </span>
          </div>

          {sortedAccounts.map(acc => (
            <AccountResult key={acc.account_id} acc={acc} onlyIssues={onlyIssues} query={query} />
          ))}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
