import React from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { Modal, TxPill, Pill } from "./ui";
import { fmt8, fmtDate, T, S } from "./helpers";

export default function ConfirmCashModal({ payload, account, mapping, onConfirm, onClose, sending }) {
  const isIn   = payload.amount > 0;
  const absAmt = Math.abs(payload.amount);

  return (
    <Modal title="Подтверждение транзакции" onClose={onClose} width={440}>
      <div style={{ padding: "20px 24px 24px" }}>
        <div style={{ background: isIn ? "#f0fdf4" : "#fef2f2", border: `1px solid ${isIn ? "#bbf7d0" : "#fecaca"}`, borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <TxPill t={isIn ? "cashin" : "cashout"} />
            <span style={{ fontSize: 22, fontWeight: 700, color: isIn ? T.green : T.red }}>{fmt8(absAmt)} USDT</span>
          </div>
          {[
            ["Binance аккаунт",    account.name],
            ["Unity accountId",    mapping?.unity_account_id],
            ["Unity realAccountId", mapping?.unity_real_account_id],
            ["assetId",            mapping?.unity_asset_id],
            ["Netting Date",       payload.netting_date],
            payload.start_date && ["Период", `${fmtDate(payload.start_date)} — ${fmtDate(payload.end_date)}`],
            payload.comment && ["Комментарий", payload.comment],
            payload.internal_comment && ["Внутренний", payload.internal_comment],
          ].filter(Boolean).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: T.muted }}>{k}</span>
              <span style={{ fontWeight: 500, color: T.ink }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={S.ghost} onClick={onClose} disabled={sending}>Отмена</button>
          <button className="btn" onClick={onConfirm} disabled={sending}
            style={{ backgroundColor: isIn ? "#059669" : "#db2777" }}>
            {sending
              ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
              : <CheckCircle size={15} style={{ marginRight: 6 }} />}
            {isIn ? "Подтвердить Cash In" : "Подтвердить Cash Out"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
