import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { AlertTriangle, CheckCircle2, CloudDownload, Download, FileBarChart, Loader2 } from "lucide-react";
import { exportExcel, getReport, getSync, listRuns, startSync } from "./api";
import {
  CATEGORY_KEYS, CATEGORY_LABELS, MATCH_LABELS, S, SUB_LABELS, T,
  downloadBlob, errText, fmtByCcy, fmtDate, fmtNum, fmtUsd, monthBounds, monthOf,
} from "./helpers";
import { DataTable, StatTile, Tabs } from "./ui";

const usd = (v) => fmtUsd(v);
const usdCell = (b) => (b ? b.usd : 0);

const SUBTABS = [
  ["profiles", "Свод по профилям"],
  ["commission", "Сделки ЦБ"],
  ["conversion", "Конвертация"],
  ["markup", "Mark-up"],
  ["crypto", "Крипта"],
  ["providers", "По провайдерам"],
];

function PeriodPicker({ period, setPeriod, disabled }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div className="input-group" style={{ margin: 0 }}>
        <label className="input-label">Месяц</label>
        <input className="text-input" type="month" disabled={disabled} style={{ width: 160 }}
          value={monthOf(period.from) === monthOf(period.to) ? monthOf(period.from) : ""}
          onChange={(e) => e.target.value && setPeriod(monthBounds(e.target.value))} />
      </div>
      <div className="input-group" style={{ margin: 0 }}>
        <label className="input-label">С</label>
        <input className="text-input" type="date" disabled={disabled} value={period.from} style={{ width: 150 }}
          onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} />
      </div>
      <div className="input-group" style={{ margin: 0 }}>
        <label className="input-label">По</label>
        <input className="text-input" type="date" disabled={disabled} value={period.to} style={{ width: 150 }}
          onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} />
      </div>
    </div>
  );
}

export default function ReportTab({ period, setPeriod, onGoTo }) {
  const [runs, setRuns]         = useState({ runs: [], loaded: [] });
  const [run, setRun]           = useState(null);       // текущая загрузка из Unity
  const [report, setReport]     = useState(null);
  const [building, setBuilding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sub, setSub]           = useState("profiles");
  const timer = useRef(null);

  const syncing = run?.status === "running";

  const refreshRuns = useCallback(async () => {
    try {
      const { data } = await listRuns();
      setRuns(data);
      return data;
    } catch { return null; }
  }, []);

  const loadReport = useCallback(async (p = period) => {
    if (!p.from || !p.to || p.from > p.to) { toast.warn("Проверьте период"); return; }
    setBuilding(true);
    try {
      const { data } = await getReport(p.from, p.to);
      setReport(data);
      if (!data.counts.client_trades && !data.counts.transactions) toast.info("За период нет загруженных данных — нажмите «Загрузить из Unity»");
    } catch (err) {
      toast.error(errText(err, "Ошибка построения отчёта"));
    } finally { setBuilding(false); }
  }, [period]);

  const poll = useCallback((runId, p) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const { data } = await getSync(runId);
        setRun(data);
        if (data.status === "running") { poll(runId, p); return; }
        refreshRuns();
        if (data.status === "done") {
          toast.success(`Загружено: сделок ${data.stats?.trades ?? 0}, транзакций ${data.stats?.transactions ?? 0}`);
          loadReport(p);
        } else {
          toast.error(data.error || "Загрузка завершилась с ошибкой");
        }
      } catch { poll(runId, p); }
    }, 2000);
  }, [loadReport, refreshRuns]);

  // если загрузка уже идёт (вкладку открыли заново) — показываем её прогресс
  useEffect(() => {
    refreshRuns().then((d) => {
      const active = d?.runs?.find((r) => r.status === "running");
      if (active) { setRun(active); poll(active.id, { from: String(active.date_from), to: String(active.date_to) }); }
    });
    return () => clearTimeout(timer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    if (!period.from || !period.to || period.from > period.to) { toast.warn("Проверьте период"); return; }
    try {
      const { data } = await startSync(period.from, period.to);
      setRun({ id: data.run_id, status: "running", progress: "Старт", date_from: period.from, date_to: period.to });
      poll(data.run_id, { ...period });
    } catch (err) {
      toast.error(errText(err, "Не удалось начать загрузку"));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await exportExcel(period.from, period.to);
      downloadBlob(data, `Доходы_${period.from}_${period.to}.xlsx`);
    } catch { toast.error("Ошибка выгрузки Excel"); }
    finally { setExporting(false); }
  };

  const covered = useMemo(
    () => runs.loaded.find((r) => String(r.date_from) <= period.from && String(r.date_to) >= period.to),
    [runs.loaded, period],
  );

  const reportStale = report && (report.period.from !== period.from || report.period.to !== period.to);

  return (
    <>
      {/* Период и действия */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "space-between" }}>
          <PeriodPicker period={period} setPeriod={setPeriod} disabled={syncing} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={handleSync} disabled={syncing}
              title="Запросить сделки и транзакции за период из Unity и сохранить в базе">
              {syncing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
                       : <CloudDownload size={14} style={{ marginRight: 6 }} />}
              {syncing ? "Загрузка..." : "Загрузить из Unity"}
            </button>
            <button style={S.ghost} onClick={() => loadReport()} disabled={building || syncing}
              title="Посчитать отчёт по уже загруженным данным (без запросов в Unity)">
              {building ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <FileBarChart size={14} />}
              Показать отчёт
            </button>
            <button style={S.ghost} onClick={handleExport} disabled={exporting || syncing || !report}>
              {exporting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
              Excel
            </button>
          </div>
        </div>

        <div style={{ ...T.small, marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          Период: <b style={{ color: T.ink }}>{fmtDate(period.from)} — {fmtDate(period.to)}</b>
          {covered
            ? <span style={{ color: T.green, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={13} /> данные загружены {fmtDate(covered.finished_at)} ({covered.started_by}) — можно сразу «Показать отчёт»
              </span>
            : <span style={{ color: T.amber }}>данные за этот период ещё не загружались</span>}
        </div>

        {syncing && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, color: T.blue }}>
            <b>Загрузка {fmtDate(run.date_from)} — {fmtDate(run.date_to)}:</b> {run.progress}
            <div style={{ color: T.muted, marginTop: 4 }}>
              Запросы в Unity идут последовательно с учётом лимитов. Исключённые счета не загружаются.
            </div>
          </div>
        )}
        {run?.status === "error" && (
          <div style={{ ...S.warn, marginTop: 10, background: "#fef2f2", borderColor: "#fecaca", color: T.red }}>
            <AlertTriangle size={14} /> Ошибка загрузки: {run.error}
          </div>
        )}

        {runs.loaded.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={T.label}>Загружено:</span>
            {runs.loaded.slice(0, 12).map((r) => (
              <button key={r.id} disabled={syncing}
                onClick={() => setPeriod({ from: String(r.date_from), to: String(r.date_to) })}
                style={{ ...S.ghost, padding: "3px 10px", fontSize: 12, borderRadius: 100 }}>
                {fmtDate(r.date_from)} — {fmtDate(r.date_to)}
                <span style={{ color: T.faint }}>· {r.stats?.trades ?? 0} сд.</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!report && !building && (
        <div style={S.empty}>
          <p style={{ color: T.faint, margin: 0, fontSize: 13 }}>
            Выберите период → «Загрузить из Unity» (если ещё не загружали) → «Показать отчёт».
          </p>
        </div>
      )}

      {report && <ReportView report={report} stale={reportStale} sub={sub} setSub={setSub} onGoTo={onGoTo} />}
    </>
  );
}

function ReportView({ report, stale, sub, setSub, onGoTo }) {
  const t = report.totals || {};
  const ms = report.match_stats || {};
  const unmatched = (ms.other?.none || 0) + (ms.conversion?.none || 0) + (ms.crypto?.none || 0);
  const totalTrades = (ms.other?.total || 0) + (ms.conversion?.total || 0) + (ms.crypto?.total || 0);

  const catCols = (nameLabel) => [
    { key: "name", label: nameLabel },
    ...CATEGORY_KEYS.map((k) => ({ key: k, label: CATEGORY_LABELS[k], num: true, total: true, render: usd })),
    { key: "total", label: "Итого USD", num: true, total: true, render: (v) => <b>{usd(v)}</b> },
  ];
  const flat = (rows) => rows.map((r) => ({
    name: r.name, ...Object.fromEntries([...CATEGORY_KEYS, "total"].map((k) => [k, usdCell(r[k])])),
  }));

  return (
    <>
      {stale && (
        <div style={{ ...S.warn, marginBottom: 12 }}>
          <AlertTriangle size={14} /> Отчёт построен за {fmtDate(report.period.from)} — {fmtDate(report.period.to)}. Период изменён — нажмите «Показать отчёт».
        </div>
      )}
      {report.missing_rates?.length > 0 && (
        <div style={{ ...S.warn, marginBottom: 12, cursor: "pointer" }} onClick={() => onGoTo("rates")}>
          <AlertTriangle size={14} />
          Нет курса на {report.rates_month?.slice(0, 7)} для: <b>{report.missing_rates.join(", ")}</b> — суммы в этих валютах не вошли в USD. Заполнить во вкладке «Курсы» →
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {CATEGORY_KEYS.map((k) => (
          <StatTile key={k} label={CATEGORY_LABELS[k]} value={`$ ${fmtUsd(t[k]?.usd ?? 0)}`}
            sub={fmtByCcy(t[k]?.by_ccy) || "—"} warn={t[k]?.missing_rate} />
        ))}
        <StatTile label="Итого" value={`$ ${fmtUsd(t.total?.usd ?? 0)}`} color={T.blue} warn={t.total?.missing_rate}
          sub={`${totalTrades} сделок клиентов · без пары у провайдера: ${unmatched}`} />
      </div>

      <Tabs tabs={SUBTABS} active={sub} onChange={setSub} size="sm" />

      <div className="card">
        {sub === "profiles" && <DataTable columns={catCols("Профиль")} rows={flat(report.by_profile)} />}
        {sub === "providers" && <DataTable columns={catCols("Провайдер")} rows={flat(report.by_provider)} />}

        {sub === "commission" && (
          <DataTable rows={report.commission} columns={[
            { key: "profile", label: "Профиль" },
            { key: "account", label: "Счёт" },
            { key: "currency", label: "Вал." },
            { key: "trades", label: "Сделок", num: true, total: true },
            { key: "client", label: "Комиссия клиента", num: true, render: (v) => fmtNum(v, 2) },
            { key: "provider", label: "Комиссия провайдера", num: true, render: (v) => fmtNum(v, 2) },
            { key: "net", label: "Чистая", num: true, render: (v) => fmtNum(v, 2) },
            { key: "funding", label: "Funding fee", num: true, render: (v) => fmtNum(v, 2) },
            { key: "total", label: "Итого в валюте", num: true, render: (v) => fmtNum(v, 2) },
            { key: "usd", label: "USD", num: true, total: true, render: (v) => (v == null ? <span style={{ color: T.amber }}>нет курса</span> : <b>{usd(v)}</b>) },
          ]} />
        )}

        {sub === "conversion" && (
          <>
            <div style={{ ...T.small, marginBottom: 8 }}>
              Доход = (курс клиента − курс провайдера) × объём; для продажи — наоборот. В базовой валюте — по курсу самой сделки.
              Если пары у провайдера нет — берётся markupAmount из Unity (колонка «Источник»).
            </div>
            <DataTable rows={report.conversions} columns={[
              { key: "transact_time", label: "Время", render: (v) => (v || "").slice(0, 19).replace("T", " ") },
              { key: "profile", label: "Профиль" },
              { key: "account", label: "Счёт" },
              { key: "provider", label: "Провайдер" },
              { key: "trade_id", label: "Trade ID" },
              { key: "pair", label: "Пара" },
              { key: "side", label: "Стор." },
              { key: "amount", label: "Объём", num: true, render: (v) => fmtNum(v, 2) },
              { key: "price", label: "Курс клиента", num: true, render: (v) => fmtNum(v, 6) },
              { key: "provider_price", label: "Курс провайдера", num: true, render: (v) => fmtNum(v, 6) },
              { key: "client_quote_amount", label: "Сумма клиента", num: true, render: (v) => fmtNum(v, 2) },
              { key: "provider_quote_amount", label: "Сумма провайдера", num: true, render: (v) => fmtNum(v, 2) },
              { key: "spread_quote", label: "Доход (котир.)", num: true, render: (v, r) => (r.quote_ccy ? `${fmtNum(v, 2)} ${r.quote_ccy}` : fmtNum(v, 2)) },
              { key: "spread_base", label: "Доход (база)", num: true, render: (v, r) => (r.base_ccy ? `${fmtNum(v, 2)} ${r.base_ccy}` : fmtNum(v, 2)) },
              { key: "markup_amount", label: "markupAmount Unity", num: true, render: (v) => fmtNum(v, 2) },
              { key: "usd", label: "Доход USD", num: true, total: true, render: (v) => (v == null ? <span style={{ color: T.amber }}>нет курса</span> : <b>{usd(v)}</b>) },
              { key: "source", label: "Источник" },
              { key: "match", label: "Пара", render: (v) => MATCH_LABELS[v] || v },
            ]} />
          </>
        )}

        {(sub === "markup" || sub === "crypto") && (
          <DataTable rows={report[sub]} columns={[
            { key: "provider", label: "Провайдер" },
            { key: "account", label: "Счёт" },
            { key: "profile", label: "Профиль" },
            { key: "sub", label: "Тип", render: (v) => SUB_LABELS[v] || v },
            { key: "currency", label: "Валюта" },
            { key: "amount", label: "Сумма в валюте", num: true, render: (v) => fmtNum(v, 2) },
            { key: "usd", label: "USD", num: true, total: true, render: (v) => (v == null ? <span style={{ color: T.amber }}>нет курса</span> : <b>{usd(v)}</b>) },
          ]} />
        )}
      </div>
    </>
  );
}
