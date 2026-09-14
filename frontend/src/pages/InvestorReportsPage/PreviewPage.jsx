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
} from "lucide-react";

import { generate as apiGenerate } from "./api";
import { fmtUSD, fmtNum, fmtPct, fmtSignedUSD, incomeColor, prettyDate } from "./helpers";

const SUB_FUND_OPTIONS = ["A", "B", "C", "G", "H"];

const MONTHS_EN = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];

// "31.08.2026" -> "31 August 2026"
const ddmmyyyyToLong = (d) => {
  if (!d) return "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
  if (!m) return d;
  return `${m[1]} ${MONTHS_EN[parseInt(m[2], 10) - 1]} ${m[3]}`;
};

// "31.08.2026" -> "2026-08-31" (для <input type="date">)
const ddmmyyyyToIso = (d) => {
  if (!d) return "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// "2026-08-31" -> "31 August 2026"
const isoToLong = (iso) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${MONTHS_EN[parseInt(m[2], 10) - 1]} ${m[1]}`;
};

// Extract "August 2026" from long "31 August 2026"
const monthYear = (longDate) => {
  const parts = (longDate || "").split(" ");
  if (parts.length < 3) return longDate || "";
  return `${parts[1]} ${parts[2]}`;
};

// Format money in USD X.XX million
const fmtMillion = (v) => `USD ${(Number(v || 0) / 1_000_000).toFixed(2)} million`;

// "0.54" -> "0,54"
const pctForCommentary = (v) => {
  const n = Number(v || 0);
  return n.toFixed(2).replace(".", ",");
};

const buildDefaultCommentary = ({ fund, longEndDate, longStartDate }) => {
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

  // Дата отчёта в ISO (для <input type="date">) — по умолчанию из Excel
  const [reportingDateIso, setReportingDateIso] = useState(
    () => ddmmyyyyToIso(fund.nav_per_unit_end_date) || ""
  );

  const [fundLetter, setFundLetter] = useState("G");

  // Длинная английская дата, derived от reportingDateIso
  const longEndDate = useMemo(
    () => isoToLong(reportingDateIso) || reporting_date,
    [reportingDateIso, reporting_date]
  );

  const longStartDate = useMemo(
    () => ddmmyyyyToLong(fund.nav_per_unit_start_date),
    [fund.nav_per_unit_start_date]
  );

  // Default commentary — пересчитывается только когда меняется дата или fund
  const defaultCommentary = useMemo(
    () => buildDefaultCommentary({ fund, longEndDate, longStartDate }),
    [fund, longEndDate, longStartDate]
  );

  const [commentary, setCommentary] = useState(defaultCommentary);
  const [commentaryEdited, setCommentaryEdited] = useState(false);
  const [loading, setLoading] = useState(false);

  // Если пользователь не редактировал commentary — обновлять его при смене даты
  const effectiveCommentary = commentaryEdited ? commentary : defaultCommentary;

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
    <div style={{ width: "100%", paddingRight: 20, paddingBottom: 50 }}>
      <button onClick={onCancel} style={backLinkStyle}>
        <ArrowLeft size={16} /> Назад
      </button>

      <h1 style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
        <FileText size={28} color="#3b82f6" />
        Превью отчёта
      </h1>
      <p style={{ marginTop: 0, marginBottom: 20, color: "#64748b", fontSize: 14 }}>
        Файл: <span style={{ color: "#94a3b8" }}>{source_filename}</span>
      </p>

      {/* ── Параметры отчёта ── */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 14px 0", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={18} color="#3b82f6" />
          Параметры отчёта
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label className="input-label">Sub-Fund</label>
            <div style={{ display: "flex", gap: 6 }}>
              {SUB_FUND_OPTIONS.map((letter) => (
                <button key={letter} type="button"
                  onClick={() => setFundLetter(letter)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    border: `2px solid ${fundLetter === letter ? "#3b82f6" : "#e2e8f0"}`,
                    background: fundLetter === letter ? "#eff6ff" : "#fff",
                    color: fundLetter === letter ? "#3b82f6" : "#64748b",
                    fontWeight: 600,
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}>
                  {letter}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              Будет вставлено в docx: "Sub-Fund {fundLetter}"
            </div>
          </div>
          <div>
            <label className="input-label">Reporting Date</label>
            <input
              type="date"
              value={reportingDateIso}
              onChange={(e) => setReportingDateIso(e.target.value)}
              className="text-input"
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              В docx: <strong style={{ color: "#334155" }}>{longEndDate}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Показатели фонда ── */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 14px 0", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={18} color="#3b82f6" />
          Показатели фонда
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <MetricCard icon={Wallet}   color="#3b82f6" label="Total Assets"       value={fmtUSD(fund.assets)} />
          <MetricCard icon={DollarSign} color="#10b981" label="NAV"                value={fmtUSD(fund.nav)} />
          <MetricCard icon={DollarSign} color="#f97316" label="Expenses"           value={fmtUSD(fund.expenses)} />
          <MetricCard icon={TrendingUp} color="#8b5cf6"
            label={`NAV per Unit (${fund.nav_per_unit_end_date})`}
            value={`USD ${Number(fund.nav_per_unit_end).toFixed(4)}`} />
          <MetricCard icon={TrendingUp} color={fund.monthly_change_pct >= 0 ? "#10b981" : "#ef4444"}
            label={`${fund.nav_per_unit_start_date} → ${fund.nav_per_unit_end_date}`}
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
            Формула: <strong>Вариант {formula}</strong> · Режим: <strong>{mode === "single" ? "по инвестору" : "сводный"}</strong>
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
                <th>Дата подписки</th>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Manager's Commentary <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>(общий для всех инвесторов · разделяй параграфы пустой строкой)</span></h3>
          {commentaryEdited && (
            <button type="button" onClick={handleResetCommentary}
              style={{ background: "transparent", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}>
              Восстановить дефолт
            </button>
          )}
        </div>
        <textarea
          value={effectiveCommentary}
          onChange={handleCommentaryChange}
          rows={8}
          className="text-input"
          style={{ width: "100%", resize: "vertical", fontFamily: "inherit", padding: 10, lineHeight: 1.5 }}
          placeholder="Введите текст комментария управляющего..."
        />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
          Дефолтный текст автоматически подставляет месяц ({monthYear(longEndDate)}), NAV, активы и % роста из Excel.
        </div>
      </div>

      {/* ── Предупреждения ── */}
      {unrecognized_sheets.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #f59e0b", background: "#fffbeb", padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "#92400e" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Нераспознанные листы</div>
              <div style={{ fontSize: 13 }}>
                {unrecognized_sheets.map((s, i) => (
                  <span key={i} style={{ display: "inline-block", background: "#fff", padding: "2px 8px", borderRadius: 10, border: "1px solid #fde68a", marginRight: 6, marginBottom: 4 }}>
                    {s}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>
                Эти листы не попадут в отчёты. Если один из них — инвестор, назовите его «В разбивке инвестор ФИО».
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Действия ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} className="btn" style={{ background: "#e2e8f0", color: "#334155" }}>
          Отмена
        </button>
        <button
          onClick={handleGenerate}
          disabled={loading || investors.length === 0}
          className="btn"
          style={{ height: 42, padding: "0 28px", background: "#10b981", display: "flex", alignItems: "center", gap: 8, opacity: loading ? 0.6 : 1 }}
        >
          <Check size={16} />
          {loading ? "Генерация..." : "Сформировать отчёты"}
        </button>
      </div>
    </div>
  );
}

const MetricCard = ({ icon: Icon, color, label, value }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}>
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
