import React from "react";
import { Trash2 } from "lucide-react";
import { StatCard, SectionTitle, Pill } from "./ui";
import { fmt, fmtDate, T, S } from "./helpers";

export default function AccountsTab({ accounts, selAccountId, onSelect, onDelete }) {
  const totalIncome  = accounts.reduce((s, a) => s + (a.total_income  || 0), 0);
  const totalRecords = accounts.reduce((s, a) => s + (a.total_records || 0), 0);
  const lastDate     = accounts.reduce(
    (lat, a) => (!a.last_record_date ? lat : (!lat || a.last_record_date > lat ? a.last_record_date : lat)),
    null,
  );

  return (
    <div>
      {accounts.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <StatCard label="Общий доход"    value={`${totalIncome >= 0 ? "+" : ""}${fmt(totalIncome)} USDT`} accent={totalIncome >= 0 ? T.green : T.red} />
          <StatCard label="Всего записей"  value={totalRecords.toLocaleString()} accent="#8b5cf6" />
          <StatCard label="Аккаунтов"      value={accounts.length} accent="#0ea5e9" />
          <StatCard label="Последняя запись" value={fmtDate(lastDate)} sub="по всем аккаунтам" accent="#f59e0b" />
        </div>
      )}

      <div className="card">
        <SectionTitle>Binance Sub-аккаунты</SectionTitle>
        {accounts.length === 0 ? (
          <div style={S.empty}>
            <p style={{ color: T.faint, margin: 0 }}>Нет аккаунтов. Нажмите «Добавить аккаунт» в правом верхнем углу.</p>
          </div>
        ) : (
          <div className="result-table-wrapper">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Создан</th>
                  <th style={{ textAlign: "right" }}>Записей</th>
                  <th style={{ textAlign: "right" }}>Funding fee, USDT</th>
                  <th>Первая запись</th>
                  <th>Последняя запись</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => {
                  const sel = String(acc.id) === String(selAccountId);
                  const pos = (acc.total_income || 0) >= 0;
                  return (
                    <tr key={acc.id}
                      style={{ cursor: "pointer", background: sel ? "#eff6ff" : undefined }}
                      onClick={() => onSelect(String(acc.id))}>
                      <td style={{ fontWeight: 600 }}>
                        {acc.name}
                        {sel && <Pill color="#dbeafe" text="#1d4ed8" style={{ marginLeft: 8 }}>выбран</Pill>}
                      </td>
                      <td style={T.small}>{fmtDate(acc.created_at)}</td>
                      <td style={{ textAlign: "right", ...T.body }}>{(acc.total_records || 0).toLocaleString()}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: pos ? T.green : T.red }}>
                        {acc.total_records > 0 ? `${pos ? "+" : ""}${fmt(acc.total_income || 0)}` : "-"}
                      </td>
                      <td style={T.small}>{fmtDate(acc.first_record_date)}</td>
                      <td style={T.small}>{fmtDate(acc.last_record_date)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button style={{ ...S.iconBtn, color: "#ef4444" }} onClick={() => onDelete(acc.id, acc.name)} title="Удалить">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
