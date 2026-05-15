import { MarkerType } from "reactflow";
import { Shuffle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { fmtAmount } from "../../utils/format";

export { fmtAmount };

export const PROVIDERS = ["Binance", "ByBit", "OKX", "HRP", "Winermute"];

export const TX_TYPES = [
  { id: "transfer", label: "Перевод", icon: Shuffle },
  { id: "deposit", label: "Пополнение", icon: ArrowDownToLine },
  { id: "withdraw", label: "Вывод", icon: ArrowUpFromLine },
];

export const EDGE_TX_TYPES = [{ id: "transfer", label: "Перевод", icon: Shuffle }];

export const edgeLabelFromTx = ({ type, amount, asset, comment }) => {
  const t = TX_TYPES.find((x) => x.id === type)?.label || "Операция";
  const a = `${fmtAmount(amount)}${asset ? ` ${asset}` : ""}`.trim();
  const c = comment?.trim() ? ` • ${comment.trim()}` : "";
  return `${t}: ${a}${c}`.trim();
};

export const normalizeTransfer = (t) => ({
  ...t,
  fromId: t.fromId ?? t.from_account_id ?? t.fromAccountId ?? null,
  toId: t.toId ?? t.to_account_id ?? t.toAccountId ?? null,
});

export const normalizeEdge = (e) => {
  const id = e?.id ?? `e-${e?.source}-${e?.target}-${Date.now()}`;
  const label = e?.label ?? "";
  return {
    ...e,
    id,
    animated: e?.animated ?? true,
    label,
    style: {
      stroke: "#7c3aed",
      strokeWidth: 2.5,
      filter: "drop-shadow(0 6px 10px rgba(124,58,237,0.25))",
      ...(e?.style || {}),
    },
    labelStyle: { fill: "#7c3aed", fontWeight: 600, ...(e?.labelStyle || {}) },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", ...(e?.markerEnd || {}) },
    data: e?.data || {},
  };
};
