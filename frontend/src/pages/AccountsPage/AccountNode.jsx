import React from "react";
import { Handle, Position } from "reactflow";

const AccountNode = ({ data }) => (
  <div
    style={{
      padding: "10px 14px",
      borderRadius: 14,
      background: "white",
      border: "1px solid #e2e8f0",
      boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
      minWidth: 200,
    }}
  >
    <Handle
      type="target"
      position={Position.Top}
      style={{ background: "#7c3aed", width: 10, height: 10 }}
    />
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase" }}>
          {data.provider || "Provider"}
        </div>
        <div
          style={{
            fontWeight: 700, color: "#0f172a", fontSize: 14,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {data.name || "Account"}
        </div>
      </div>
      {data.badge ? (
        <div
          style={{
            fontSize: 11, fontWeight: 600, color: "#0ea5e9",
            background: "#e0f2fe", padding: "4px 8px",
            borderRadius: 999, border: "1px solid #bae6fd", whiteSpace: "nowrap",
          }}
        >
          {data.badge}
        </div>
      ) : null}
    </div>
    <Handle
      type="source"
      position={Position.Bottom}
      style={{ background: "#7c3aed", width: 10, height: 10 }}
    />
  </div>
);

export default AccountNode;
