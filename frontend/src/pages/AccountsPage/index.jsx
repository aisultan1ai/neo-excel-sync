import React from "react";
import { Wallet } from "lucide-react";
import CryptoTab from "./CryptoTab";

const AccountsPage = () => (
  <div
    style={{
      padding: 18, height: "100vh", display: "flex", flexDirection: "column",
      background: "#f8fafc", boxSizing: "border-box",
    }}
  >
    <div
      style={{
        marginBottom: 14, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}
    >
      <h1 style={{ fontSize: 22, color: "#0f172a", display: "flex", alignItems: "center", gap: 10, margin: 0, fontWeight: 800 }}>
        <Wallet color="#7c3aed" /> Крипто счета
      </h1>
    </div>

    <div style={{ flex: 1, overflow: "hidden" }}>
      <CryptoTab />
    </div>

    <style>{`
      .text-input{border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;font-size:14px;outline:none;width:100%;box-sizing:border-box;background:white;font-weight:400;}
      .text-input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.12);}
      .btn-primary{background:#3b82f6;color:white;border:1px solid #3b82f6;padding:10px 14px;border-radius:12px;cursor:pointer;font-weight:600;}
      .btn-primary:disabled{cursor:not-allowed;}
      .btn-secondary{background:#ffffff;color:#0f172a;border:1px solid #e2e8f0;padding:10px 14px;border-radius:12px;cursor:pointer;font-weight:600;}
      .btn-secondary:hover{background:#f8fafc;}
      .btn-secondary:disabled{cursor:not-allowed;}
      .card{background:white;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #e2e8f0;}
      .card-gradient{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:14px;box-shadow:0 10px 24px rgba(79,70,229,0.25);transition:transform .15s ease;}
      .card-gradient:hover{transform:translateY(-1px);}
      .list-item:hover{background:#f8fafc;}
      .icon-pill{border:1px solid #e2e8f0;background:#fff;border-radius:10px;width:32px;height:32px;display:grid;place-items:center;cursor:pointer;color:#334155;}
      .icon-pill:hover{background:#f8fafc;}
      .icon-pill.danger{border-color:#fecaca;color:#ef4444;}
    `}</style>
  </div>
);

export default AccountsPage;
