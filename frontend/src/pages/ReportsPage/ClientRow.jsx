import React from "react";
import { ChevronRight } from "lucide-react";

const ClientRow = React.memo(({ client, statusInfo, onClick }) => (
  <tr
    onClick={() => onClick(client)}
    style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.1s" }}
    className="table-row-hover"
  >
    <td style={{ padding: "15px" }}>
      <div style={{ fontWeight: 600, color: "#1e293b" }}>{client.name}</div>
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>ID: {client.id}</div>
    </td>
    <td style={{ padding: "15px" }}>
      <span style={{ padding: "4px 10px", borderRadius: "15px", fontSize: "12px", fontWeight: 600, background: statusInfo.bg, color: statusInfo.color }}>
        {statusInfo.label}
      </span>
    </td>
    <td style={{ padding: "15px", textAlign: "right" }}>
      <button className="btn-icon" style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>
        <ChevronRight size={20} />
      </button>
    </td>
  </tr>
));

export default ClientRow;
