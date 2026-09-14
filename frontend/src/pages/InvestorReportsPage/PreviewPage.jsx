import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  FileText,
  TrendingUp,
  Wallet,
  DollarSign,
  BarChart3,
  Users as UsersIcon,
  AlertTriangle,
  Check,
  Calendar,
  RotateCcw,
} from "lucide-react";

import { generate as apiGenerate } from "./api";
import { fmtUSD, fmtNum, fmtPct, fmtSignedUSD, incomeColor, prettyDate } from "./helpers";
import { StepIndicator, InfoHint, AutoGrowTextarea, InvestorReportStyles } from "./ui";

const SUB_FUND_OPTIONS = ["A", "B", "C", "G", "H"];
const DEFAULT_SUB_FUND = "G";

const MONTHS_EN = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];

const ddmmyyyyToLong = (d) => {
  if (!d) return "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
  if (!m) return d;
  return `${m[1]} ${MONTHS_EN[parseInt(m[2], 10) - 1]} ${m[3]}`;
};

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
  const { fund, investors, unrecognized_sheets = [], reporting_date, source_filename,
          mode, formula, upload_token } = data;

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

  const handleCommentaryChange = (e) => {
    setCommentary(e.target.value);
    setCommentaryEdited(true);
  };

  const handleResetCommentary = () => {
    setCommentary(defaultCommentary);
    setCommentaryEdited(false);
  };

  const handleGenerate = async () => {
    if (!investors?.length) {
      toast.error("В превью нет ни одного инвестора");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        upload_token,
        source_filename,
        mode,
        formula,
        commentary: effectiveCommentary?.trim() || null,
        fund_letter: fundLetter,
        reporting_date_override: longEndDate,
        report: {
          reporting_date: longEndDate,
          unrecognized_sheets,
          fund,
          investors,
        },
      };
      const { data: res } = await apiGenerate(payload);
      toast.success(`Сгенерировано ${res.investors_count} отчётов`);
      onGenerated(res);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Ошибка генерации";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 100 }}>
      <InvestorReportStyles />

      <button onClick={onCancel} style={backLinkStyle}>
        <ArrowLeft size={16} /> Назад
      </button>

      <StepIndicator current="preview" />

      <h1 style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
        <FileText size={28} color="#3b82f6" />
        Превью отчёта
      </h1>
      <p style={{ marginTop: 0, marginBottom: 20, color: "#64748b", fontSize: 14 }}>
        Файл: <span style={{ color: "#94a3b8" }}>{source_filename}</span>
      </p>

      {/* ── Warnings НА ВЕРХУ (не в подвале) ── */}
      {unrecognized_sheets.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #f59e0b", background: "#fffbeb", padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "#92400e" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Нераспознанные листы ({unrecognized_sheets.length})</div>
              <div style={{ fontSize: 13 }}>
                {unrecognized_sheets.map((s, i) => (
                  <span key={i} style={{ display: "inline-block", background: "#fff", padding: "2px 8px", borderRadius: 10, border: "1px solid #fde68a", marginRight: 6, marginBottom: 4 }}>
                    {s}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>
                Эти листы не попадут в отчёты. Если один из них — инвестор, переименуй его в «В разбивке инвестор ФИО».
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Параметры отчёта (inline) ── */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={14} color="#64748b" />
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Параметры docx:</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>Sub-Fund</label>
            <select value={fundLetter}
                    onChange={(e) => setFundLetter(e.target.value)}
                    className="text-input"
                    style={{ width: 60, padding: "4px 6px", fontSize: 13, fontWeight: 600 }}>
              {SUB_FUND_OPTIONS.map((l) => (<option key={l} value={l}>{l}</option>))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 12, color: "#64748b" }}>Reporting Date</label>
            <input type="date"
                   value={reportingDateIso}
                   onChange={(e) => setReportingDateIso(e.target.value)}
                   className="text-input"
                   style={{ width: 150, padding: "4px 6px", fontSize: 13 }} />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>→ {longEndDate}</span>
          </div>
        </div>
      </div>

      {/* ── Показатели фонда ── */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 14px 0", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={18} color="#3b82f6" />
          Показатели фонда
          <InfoHint text="Данные извлечены из листа инвестора в Excel — общие для всех отчётов за этот период" />
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <MetricCard icon={Wallet}   color="#3b82f6"
            label="Total Assets" hint="Совокупные активы фонда"
            value={fmtUSD(fund.assets)} />
          <MetricCard icon={DollarSign} color="#10b981"
            label="NAV" hint="Net Asset Value — стоимость чистых активов (активы − обязательства)"
            value={fmtUSD(fund.nav)} />
          <MetricCard icon={DollarSign} color="#f97316"
            label="Expenses" hint="Обязательства и расходы фонда"
            value={fmtUSD(fund.expenses)} />
          <MetricCard icon={TrendingUp} color="#8b5cf6"
            label={`NAV per Unit (${fund.nav_per_unit_end_date})`}
            hint="Стоимость одного пая на конец периода"
            value={`USD ${Number(fund.nav_per_unit_end).toFixed(4)}`} />
          <MetricCard icon={TrendingUp} color={fund.monthly_change_pct >= 0 ? "#10b981" : "#ef4444"}
            label={`${fund.nav_per_unit_start_date} → ${fund.nav_per_unit_end_date}`}
            hint="Изменение цены пая за отчётный месяц"
            value={fmtPct(fund.monthly_change_pct)} />
        </div>
      </div>

      {/* ── Инвесторы ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            <UsersIcon size={18} color="#3b82f6" />
            Найдено инвесторов ({investors.length})
          </h3>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            Режим: <strong>{mode === "single" ? "по инвестору" : "сводный"}</strong>
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="styled-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Инвестор</th>
                <th style={{ textAlign: "center" }} title="Число подписок этого инвестора">Траншей</th>
                <th style={{ textAlign: "right" }} title="Сумма всех подписок инвестора в USD">Вложено</th>
                <th style={{ textAlign: "right" }} title="Совокупное количество паёв фонда">Паёв</th>
                <th style={{ textAlign: "right" }} title="units × NAV per Unit (конец месяца)">Текущая ст-ть</th>
                <th style={{ textAlign: "right" }} title="Доход за отчётный месяц (Variant B)">Доход за месяц</th>
                <th style={{ textAlign: "right" }} title="Совокупный доход с даты подписки до сегодня">Доход total</th>
                <th title="Самая ранняя дата подписки среди траншей">Дата подписки</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((inv, i) => (
                <tr key={inv.name + "-" + i}>
                  <td>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{inv.name}</div>
                  </td>
                  <td style={{ textAlign: "center" }}>{inv.tranches_count || inv.tranches?.length || 0}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(inv.total_subscription)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(inv.total_units, 2)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(inv.current_value)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: incomeColor(inv.monthly_income) }}>
                    {fmtSignedUSD(inv.monthly_income)} <span style={{ fontSize: 11, opacity: 0.75 }}>({fmtPct(inv.monthly_income_pct)})</span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: incomeColor(inv.total_income) }}>
                    {fmtSignedUSD(inv.total_income)} <span style={{ fontSize: 11, opacity: 0.75 }}>({fmtPct(inv.total_income_pct)})</span>
                  </td>
                  <td style={{ fontSize: 13, color: "#64748b" }}>{prettyDate(inv.earliest_subscription_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Комментарий управляющего ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            Manager's Commentary
            <InfoHint text="Один текст на всех инвесторов. Разделяй параграфы пустой строкой (Enter × 2) — в docx будет 2 отдельных абзаца." />
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              {commentaryParas.length} {commentaryParas.length === 1 ? "параграф" : "параграфов"} · {effectiveCommentary.length} симв.
            </span>
            {commentaryEdited && (
              <button type="button" onClick={handleResetCommentary}
                style={{ background: "transparent", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <RotateCcw size={12} /> Дефолт
              </button>
            )}
          </div>
        </div>
        <AutoGrowTextarea
          value={effectiveCommentary}
          onChange={handleCommentaryChange}
          className="text-input"
          style={{ width: "100%", minHeight: 140, fontFamily: "inherit", padding: 12, lineHeight: 1.6, fontSize: 13 }}
          placeholder="Введите текст комментария управляющего..."
        />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
          Дефолтный текст автоматически подставляет месяц ({monthYear(longEndDate)}), NAV, активы и % роста из Excel.
        </div>
      </div>

      {/* ── Sticky action-bar снизу ── */}
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
            style={{ background: "#e2e8f0", color: "#334155", padding: "8px 20px" }}>
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

const MetricCard = ({ icon: Icon, color, label, value, hint }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}
       title={hint || ""}>
    <div style={{ background: `${color}18`, padding: 8, borderRadius: 8 }}>
      <Icon size={16} color={color} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", fontFamily: "monospace" }}>{value}</div>
    </div>
  </div>
);

const backLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  border: "none",
  color: "#3b82f6",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  padding: "6px 0",
  marginBottom: 8,
};
