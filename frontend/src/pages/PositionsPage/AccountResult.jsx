import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { STATUS, T, S, fmtQty, fmtSigned, isIssue } from "./helpers";
import { StatusBadge } from "./ui";

const right = { textAlign: "right" };

function TradesDetail({ row }) {
  // нарастающая позиция после каждой сделки — видно, где «потерялась» позиция
  const withRunning = useMemo(() => {
    let run = 0;
    return row.trades.map(t => {
      run += t.side === "BUY" ? t.amount : t.side === "SELL" ? -t.amount : 0;
      run = Math.round(run * 1e8) / 1e8;
      return { ...t, running: run };
    });
  }, [row.trades]);

  return (
    <div style={{ padding: "12px 16px 16px 40px", background: T.bg, whiteSpace: "normal", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 10, ...T.small }}>
        <span>Куплено: <b style={{ color: T.green }}>{fmtQty(row.buy_qty)}</b></span>
        <span>Продано: <b style={{ color: T.red }}>{fmtQty(row.sell_qty)}</b></span>
        {row.lot_size != null && <span>Лот: <b style={{ color: T.ink }}>{fmtQty(row.lot_size)}</b></span>}
        {row.category && <span>Категория: <b style={{ color: T.ink }}>{row.category}</b></span>}
        <span>
          Позиции на счёте:{" "}
          {row.positions.length === 0
            ? <b style={{ color: T.red }}>нет</b>
            : row.positions.map(p => (
                <b key={p.position_id} style={{ color: T.ink, marginRight: 8 }}>
                  #{p.position_id}: {fmtQty(p.amount)}{p.open_date ? ` (с ${p.open_date})` : ""}{p.hedge ? " · hedge" : ""}
                </b>
              ))}
        </span>
      </div>

      {withRunning.length === 0 ? (
        <div style={{ ...S.empty, padding: 14, background: "#fff" }}>
          <span style={{ color: T.faint, fontSize: 12 }}>DIRECT-сделок за период нет</span>
        </div>
      ) : (
        <div className="result-table-wrapper" style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 8, background: "#fff" }}>
          <table className="styled-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сторона</th>
                <th style={right}>Кол-во</th>
                <th style={right}>Цена</th>
                <th style={right}>Позиция после</th>
                <th>Trade ID</th>
                <th>Position ID</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {withRunning.map(t => (
                <tr key={t.id}>
                  <td>{t.trade_date}</td>
                  <td style={{ color: t.side === "BUY" ? T.green : T.red, fontWeight: 600 }}>{t.side}</td>
                  <td style={right}>{fmtQty(t.amount)}</td>
                  <td style={right}>{fmtQty(t.price)}</td>
                  <td style={{ ...right, fontWeight: 600, color: T.ink }}>{fmtQty(t.running)}</td>
                  <td style={{ color: T.muted }}>{t.id}</td>
                  <td style={{ color: T.muted }}>{t.position_id ?? "—"}</td>
                  <td style={{ color: T.muted, whiteSpace: "normal" }}>{t.comment || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AccountResult({ acc, onlyIssues, query }) {
  const [open, setOpen] = useState({});

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (acc.rows || []).filter(r =>
      (!onlyIssues || isIssue(r)) &&
      (!q || [r.ticker, r.code, r.name, r.isin, String(r.instrument_id)]
        .some(v => v && String(v).toLowerCase().includes(q))),
    );
  }, [acc.rows, onlyIssues, query]);

  const issues = (acc.rows || []).filter(isIssue).length;
  const title = acc.account_name ? `${acc.account_name}` : `Счёт ${acc.account_id}`;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
            {acc.error
              ? <AlertTriangle size={16} color={T.red} />
              : issues === 0
                ? <CheckCircle2 size={16} color={T.green} />
                : <AlertTriangle size={16} color="#c2410c" />}
            {title}
            {acc.account_name && <span style={{ fontSize: 12, color: T.faint, fontWeight: 400 }}>{acc.account_id}</span>}
          </div>
          {!acc.error && (
            <div style={{ ...T.small, marginTop: 3 }}>
              Позиций на счёте: <b>{acc.positions_count}</b> · DIRECT-сделок: <b>{acc.trades_count}</b> · Инструментов: <b>{acc.rows.length}</b>
              {" · "}Сделки: <b>{acc.from_date}</b> — <b>{acc.to_date}</b>
              {acc.period_source === "account_open_date" && " (с даты открытия счёта)"}
            </div>
          )}
        </div>
        {!acc.error && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(STATUS).map(s => acc.summary[s] > 0 && (
              <StatusBadge key={s} status={s} count={acc.summary[s]} />
            ))}
          </div>
        )}
      </div>

      {acc.error ? (
        <div style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 13 }}>
          Не удалось получить данные: {acc.error}
        </div>
      ) : rows.length === 0 ? (
        <div style={S.empty}>
          <p style={{ color: issues === 0 && onlyIssues ? T.green : T.faint, margin: 0, fontSize: 13 }}>
            {issues === 0 && onlyIssues ? "Все позиции сходятся со сделками" : "По фильтру ничего не найдено"}
          </p>
        </div>
      ) : (
        <div className="result-table-wrapper">
          <table className="styled-table" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ width: 20 }} />
                <th>Тикер</th>
                <th>Инструмент</th>
                <th style={right}>По сделкам</th>
                <th style={right}>На счёте</th>
                <th style={right}>Разница</th>
                <th style={right}>Сделок</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isOpen = !!open[r.instrument_id];
                return (
                  <React.Fragment key={r.instrument_id}>
                    <tr style={{ cursor: "pointer" }} title="Показать сделки"
                      onClick={() => setOpen(o => ({ ...o, [r.instrument_id]: !isOpen }))}>
                      <td style={{ color: T.faint }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td style={{ fontWeight: 700, color: T.ink }}>{r.ticker}</td>
                      <td style={{ color: T.muted, fontSize: 12 }}>
                        {r.code || r.name || `ID ${r.instrument_id}`}{r.isin ? ` · ${r.isin}` : ""}
                      </td>
                      <td style={right}>{fmtQty(r.expected)}</td>
                      <td style={right}>{fmtQty(r.actual)}</td>
                      <td style={{ ...right, fontWeight: 600, color: r.diff === 0 ? T.faint : T.red }}>{fmtSigned(r.diff)}</td>
                      <td style={right}>{r.trades_count}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0 }}><TradesDetail row={r} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
