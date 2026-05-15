import React from "react";
import { AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { STATUS_CONFIG, formatYmdToRu } from "./helpers";

const TaskCard = ({ task, activeDept, onClick }) => {
  const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG["Open"];
  const StatusIcon = statusInfo.icon;

  return (
    <div
      className="card"
      style={{ padding: "20px", cursor: "pointer", border: "1px solid #e2e8f0", borderLeft: `4px solid ${statusInfo.color}`, transition: "all 0.2s" }}
      onClick={() => onClick(task)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "10px", gap: "10px" }}>
        <div style={{ color: "#64748b" }}>
          {activeDept === "My Tasks" ? (
            <>To: <span style={{ fontWeight: 600, color: "#3b82f6" }}>{task.to_user_id ? `👤 ${task.to_user_name}` : task.to_department}</span></>
          ) : (
            <><span style={{ fontWeight: 600 }}>{task.author_name}</span>{" "}<span style={{ marginLeft: "5px", background: "#f1f5f9", padding: "2px 5px", borderRadius: "4px" }}>{task.author_dept}</span></>
          )}
        </div>
        <div style={{ color: statusInfo.color, display: "flex", alignItems: "center", gap: "4px", fontWeight: 600, flexShrink: 0 }}>
          <StatusIcon size={12} /> {statusInfo.label}
        </div>
      </div>

      <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: task.status === "Done" ? "#94a3b8" : "#0f172a", textDecoration: task.status === "Done" ? "line-through" : "none" }}>
        {task.title}
      </h3>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        {task.priority === "urgent" && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#ef4444", background: "#fee2e2", padding: "3px 8px", borderRadius: "999px" }}>
            <AlertTriangle size={12} /> Срочно
          </div>
        )}
        {task.due_date && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#334155", background: "#f1f5f9", padding: "3px 8px", borderRadius: "999px" }}>
            <Clock size={12} /> Дедлайн: {formatYmdToRu(task.due_date)}
          </div>
        )}
        {task.accepted_by_user_id && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#0f172a", background: "#ecfdf5", padding: "3px 8px", borderRadius: "999px", border: "1px solid #d1fae5" }}>
            <CheckCircle size={12} /> Принял: {task.accepted_by_name}
          </div>
        )}
      </div>

      <p style={{ color: "#475569", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {task.description}
      </p>
    </div>
  );
};

export default TaskCard;
