import React, { useState } from "react";
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
} from "lucide-react";

import { generate as apiGenerate } from "./api";
import { fmtUSD, fmtNum, fmtPct, fmtSignedUSD, incomeColor, prettyDate } from "./helpers";

export default function PreviewPage({ data, onCancel, onGenerated }) {
  const [commentary, setCommentary] = useState(
    `During ${data.reporting_date.replace(/^\d+\s+/, "")}, the Fund continued to demonstrate ` +
    `stable growth. Detailed asset composition is available upon request.`
  );
  const [loading, setLoading] = useState(false);

  const { fund, investors, unrecognized_sheets = [], reporting_date, source_filename, mode, formula, upload_token } = data;

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
        commentary: commentary?.trim() || null,
        report: {
          reporting_date,
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
        Отчётный период: <strong style={{ color: "#1e293b" }}>{reporting_date}</strong>
        &nbsp;·&nbsp; Файл: <span style={{ color: "#94a3b8" }}>{source_filename}</span>
      </p>

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
                <tr key={i}>
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
        <h3 style={{ margin: "0 0 10px 0", fontSize: 15 }}>Manager's Commentary (общий для всех инвесторов)</h3>
        <textarea
          value={commentary}
          onChange={(e) => setCommentary(e.target.value)}
          rows={4}
          className="text-input"
          style={{ width: "100%", resize: "vertical", fontFamily: "inherit", padding: 10 }}
          placeholder="Введите текст комментария управляющего..."
        />
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
          onMouseOver={(e) => (e.currentTarget.style.background = "#059669")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#10b981")}
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
