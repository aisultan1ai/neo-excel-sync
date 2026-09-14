import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  TrendingUp,
  Wallet,
  DollarSign,
  Users as UsersIcon,
  Check,
  RotateCcw,
} from "lucide-react";

import { generate as apiGenerate } from "./api";
import { fmtUSD, fmtNum, fmtPct, fmtSignedUSD, incomeColor, prettyDate } from "./helpers";
import { PageTopBar, InfoHint, AutoGrowTextarea, InvestorReportStyles } from "./ui";

const SUB_FUND_OPTIONS = ["A", "B", "C", "G", "H"];
const DEFAULT_SUB_FUND = "G";

const MONTHS_EN = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];

const ddmmyyyyToIso = (d) => {
  if (!d) return "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const isoToLong = (iso) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${MONTHS_EN[parseInt(m[2], 10) - 1]} ${m[1]}`;
};

const monthYear = (longDate) => {
  const parts = (longDate || "").split(" ");
  if (parts.length < 3) return longDate || "";
  return `${parts[1]} ${parts[2]}`;
};

const fmtMillion = (v) => `USD ${(Number(v || 0) / 1_000_000).toFixed(2)} million`;

const pctForCommentary = (v) => {
  const n = Number(v || 0);
  return n.toFixed(2).replace(".", ",");
};

const buildDefaultCommentary = ({ fund, longEndDate }) => {
  const mY = monthYear(longEndDate);
  const growth = pctForCommentary(fund.monthly_change_pct);
  return (
    `During ${mY}, the Fund continued to demonstrate positive performance, ` +
    `with its asset base increasing during the reporting period. As of ${longEndDate}, ` +
    `the Fund's total assets amounted to ${fmtMillion(fund.assets)}, while Net Asset Value (NAV) ` +
    `reached ${fmtMillion(fund.nav)}.\n\n` +
    `During the reporting period, the Fund generated a positive return of approximately ${growth}% ` +
    `based on the change in Net Asset Value before taking into account the effect of the new ` +
    `subscription received during the month.`
  );
};

export default function PreviewPage({ data, onCancel, onGenerated }) {
  const { fund, investors, reporting_date, source_filename,
          mode, formula, upload_token, unrecognized_sheets = [] } = data;

  const [reportingDateIso, setReportingDateIso] = useState(
    () => ddmmyyyyToIso(fund.nav_per_unit_end_date) || ""
  );
  const [fundLetter, setFundLetter] = useState(DEFAULT_SUB_FUND);

  const longEndDate = useMemo(
    () => isoToLong(reportingDateIso) || reporting_date,
    [reportingDateIso, reporting_date]
  );

  const defaultCommentary = useMemo(
    () => buildDefaultCommentary({ fund, longEndDate }),
    [fund, longEndDate]
  );

  const [commentary, setCommentary] = useState(defaultCommentary);
  const [commentaryEdited, setCommentaryEdited] = useState(false);
  const [loading, setLoading] = useState(false);

  const effectiveCommentary = commentaryEdited ? commentary : defaultCommentary;
  const commentaryParas = useMemo(
    () => effectiveCommentary.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
    [effectiveCommentary]
  );

  const handleGenerate = async () => {
    if (!investors?.length) {
      toast.error("В превью нет ни одного инвестора");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        upload_token, source_filename, mode, formula,
        commentary: effectiveCommentary?.trim() || null,
        fund_letter: fundLetter,
        reporting_date_override: longEndDate,
        report: { reporting_date: longEndDate, unrecognized_sheets, fund, investors },
      };
      const { data: res } = await apiGenerate(payload);
      toast.success(`Сгенерировано ${res.investors_count} отчётов`);
      onGenerated(res);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Ошибка генерации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 100 }}>
      <InvestorReportStyles />

      <PageTopBar onBack={onCancel} backLabel="Назад" current="preview" />

      {/* Файл + параметры docx — одна строка */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        padding: "10px 16px", background: "#f8fafc", borderRadius: 10,
        border: "1px solid #f1f5f9", marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, color: "#64748b", flex: "1 1 auto" }}>
          <span style={{ color: "#94a3b8" }}>Файл: </span>
          <span style={{ color: "#334155", fontFamily: "monospace" }}>{source_filename}</span>
        </div>

        <ParamField label="Sub-Fund">
          <select value={fundLetter}
                  onChange={(e) => setFundLetter(e.target.value)}
                  style={selectStyle}>
            {SUB_FUND_OPTIONS.map((l) => (<option key={l} value={l}>{l}</option>))}
          </select>
        </ParamField>

        <ParamField label="Reporting Date">
          <input type="date" value={reportingDateIso}
                 onChange={(e) => setReportingDateIso(e.target.value)}
                 style={{ ...selectStyle, width: 138 }} />
          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{longEndDate}</span>
        </ParamField>
      </div>

      {/* Показатели фонда — узкая полоса */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 10, marginBottom: 16,
      }}>
        <MetricInline icon={Wallet}   color="#3b82f6" label="Total Assets" hint="Совокупные активы фонда"
                       value={fmtUSD(fund.assets)} />
        <MetricInline icon={DollarSign} color="#10b981" label="NAV" hint="Стоимость чистых активов"
                       value={fmtUSD(fund.nav)} />
        <MetricInline icon={DollarSign} color="#f97316" label="Expenses" hint="Обязательства/расходы"
                       value={fmtUSD(fund.expenses)} />
        <MetricInline icon={TrendingUp} color="#8b5cf6"
                       label={`NAV/Unit ${fund.nav_per_unit_end_date}`} hint="Цена пая на конец периода"
                       value={`USD ${Number(fund.nav_per_unit_end).toFixed(4)}`} />
        <MetricInline icon={TrendingUp} color={fund.monthly_change_pct >= 0 ? "#10b981" : "#ef4444"}
                       label="Изменение за месяц" hint={`${fund.nav_per_unit_start_date} → ${fund.nav_per_unit_end_date}`}
                       value={fmtPct(fund.monthly_change_pct)} />
      </div>

      {/* Инвесторы */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#334155" }}>
            <UsersIcon size={16} color="#64748b" />
            Инвесторы <span style={{ color: "#94a3b8", fontWeight: 400 }}>({investors.length})</span>
          </div>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {mode === "single" ? "по инвестору" : "сводный"}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="styled-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Инвестор</th>
                <th style={{ textAlign: "center" }}>Траншей</th>
                <th style={{ textAlign: "right" }}>Вложено</th>
                <th style={{ textAlign: "right" }}>Паёв</th>
                <th style={{ textAlign: "right" }}>Текущая ст-ть</th>
                <th style={{ textAlign: "right" }}>Доход за месяц</th>
                <th style={{ textAlign: "right" }}>Доход total</th>
                <th>Подписка</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((inv, i) => (
                <tr key={inv.name + "-" + i}>
                  <td style={{ fontWeight: 600, color: "#1e293b" }}>{inv.name}</td>
                  <td style={{ textAlign: "center" }}>{inv.tranches_count || inv.tranches?.length || 0}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(inv.total_subscription)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(inv.total_units, 2)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(inv.current_value)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: incomeColor(inv.monthly_income) }}>
                    {fmtSignedUSD(inv.monthly_income)} <span style={{ fontSize: 11, opacity: 0.7 }}>({fmtPct(inv.monthly_income_pct)})</span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: incomeColor(inv.total_income) }}>
                    {fmtSignedUSD(inv.total_income)} <span style={{ fontSize: 11, opacity: 0.7 }}>({fmtPct(inv.total_income_pct)})</span>
                  </td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{prettyDate(inv.earliest_subscription_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commentary */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", display: "inline-flex", alignItems: "center" }}>
            Manager's Commentary
            <InfoHint text="Разделяй параграфы пустой строкой (Enter × 2). В docx будет 2 отдельных абзаца." />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              {commentaryParas.length} {commentaryParas.length === 1 ? "параграф" : "параграфов"} · {effectiveCommentary.length} симв.
            </span>
            {commentaryEdited && (
              <button type="button"
                onClick={() => { setCommentary(defaultCommentary); setCommentaryEdited(false); }}
                style={{ background: "transparent", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 11, padding: "3px 8px", borderRadius: 5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <RotateCcw size={11} /> Дефолт
              </button>
            )}
          </div>
        </div>
        <AutoGrowTextarea
          value={effectiveCommentary}
          onChange={(e) => { setCommentary(e.target.value); setCommentaryEdited(true); }}
          className="text-input"
          style={{ width: "100%", minHeight: 130, fontFamily: "inherit", padding: 12, lineHeight: 1.6, fontSize: 13 }}
          placeholder="Введите текст комментария управляющего..."
        />
      </div>

      {/* Sticky action-bar снизу */}
      <div style={{
        position: "sticky", bottom: 0,
        marginTop: 20, marginLeft: -30, marginRight: -30,
        padding: "12px 30px",
        background: "rgba(255,255,255,0.96)",
        borderTop: "1px solid #e2e8f0",
        backdropFilter: "blur(6px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        zIndex: 50,
      }}>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          <strong style={{ color: "#1e293b" }}>{investors.length}</strong> инвесторов · Sub-Fund <strong>{fundLetter}</strong> · <strong>{longEndDate}</strong>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} className="btn"
            style={{ background: "transparent", color: "#64748b", padding: "8px 20px", boxShadow: "none" }}>
            Отмена
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || investors.length === 0}
            className="btn"
            style={{ padding: "8px 24px", background: "#10b981", display: "flex", alignItems: "center", gap: 8, opacity: loading ? 0.6 : 1 }}
          >
            <Check size={16} />
            {loading ? "Генерация..." : "Сформировать отчёты"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ParamField = ({ label, children }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
    {children}
  </div>
);

const selectStyle = {
  padding: "4px 8px",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#fff",
  color: "#1e293b",
  cursor: "pointer",
};

const MetricInline = ({ icon: Icon, color, label, value, hint }) => (
  <div title={hint || ""}
       style={{
         display: "flex", alignItems: "center", gap: 10,
         padding: "10px 12px", background: "#fff",
         borderRadius: 8, border: "1px solid #f1f5f9",
       }}>
    <div style={{ background: `${color}15`, padding: 6, borderRadius: 6, display: "inline-flex" }}>
      <Icon size={14} color={color} />
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", fontFamily: "monospace", marginTop: 1 }}>{value}</div>
    </div>
  </div>
);
