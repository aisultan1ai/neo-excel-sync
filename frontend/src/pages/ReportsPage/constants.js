export const STATUS_STYLES = {
  Нет: { bg: "#f1f5f9", color: "#64748b", label: "Нет отчетов" },
  "В ожидании": { bg: "#fef9c3", color: "#b45309", label: "В ожидании" },
  Отправлено: { bg: "#dcfce7", color: "#166534", label: "Отправлено" },
};

export const STATUS_DB_MAP = { gray: "Нет", yellow: "В ожидании", green: "Отправлено" };
export const STATUS_DISPLAY_MAP = { Нет: "gray", "В ожидании": "yellow", Отправлено: "green" };
