import { Circle, Clock, CheckCircle } from "lucide-react";

export const STATUS_CONFIG = {
  Open: { label: "Новая", color: "#64748b", bg: "#f1f5f9", icon: Circle },
  "In Progress": { label: "В работе", color: "#3b82f6", bg: "#eff6ff", icon: Clock },
  Done: { label: "Выполнено", color: "#10b981", bg: "#ecfdf5", icon: CheckCircle },
};

export const formatYmdToRu = (ymd) => {
  if (!ymd || typeof ymd !== "string") return "";
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
};
