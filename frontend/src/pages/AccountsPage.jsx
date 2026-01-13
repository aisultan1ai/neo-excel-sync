import React, { useState, useCallback, useMemo, useEffect } from "react";
import { api } from "../api";
import { toast } from "react-toastify";
import {
  Wallet,
  Plus,
  X,
  Maximize2,
  Pencil,
  Trash2,
  Save,
  History,
  FolderOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shuffle,
} from "lucide-react";

import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";

const cx = (...arr) => arr.filter(Boolean).join(" ");

const PROVIDERS = ["Binance", "ByBit", "OKX", "Kraken", "Ledger", "Metamask"];

const TX_TYPES = [
  { id: "transfer", label: "Перевод", icon: Shuffle },
  { id: "deposit", label: "Пополнение", icon: ArrowDownToLine },
  { id: "withdraw", label: "Вывод", icon: ArrowUpFromLine },
];

// В схеме (стрелки) — только переводы между счетами
const EDGE_TX_TYPES = [{ id: "transfer", label: "Перевод", icon: Shuffle }];

const fmtAmount = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });
};

const edgeLabelFromTx = ({ type, amount, asset, comment }) => {
  const t = TX_TYPES.find((x) => x.id === type)?.label || "Операция";
  const a = `${fmtAmount(amount)}${asset ? ` ${asset}` : ""}`.trim();
  const c = comment?.trim() ? ` • ${comment.trim()}` : "";
  return `${t}: ${a}${c}`.trim();
};

// Универсально распаковать ответы (поддерживает и {status,data}, и просто data)
const unwrap = (resData) => {
  if (resData && typeof resData === "object" && "data" in resData) return resData.data;
  return resData;
};

// Нормализация transfers под разные имена полей
const normalizeTransfer = (t) => ({
  ...t,
  fromId: t.fromId ?? t.from_account_id ?? t.fromAccountId ?? null,
  toId: t.toId ?? t.to_account_id ?? t.toAccountId ?? null,
});

// =====================================================
// API CALLS
// =====================================================
const fetchCryptoAccounts = async () => unwrap((await api.get("/crypto/accounts")).data);

const createCryptoAccount = async (payload) => unwrap((await api.post("/crypto/accounts", payload)).data);
const updateCryptoAccount = async (id, payload) => unwrap((await api.put(`/crypto/accounts/${id}`, payload)).data);
const deleteCryptoAccount = async (id) => unwrap((await api.delete(`/crypto/accounts/${id}`)).data);

const fetchTransfers = async () => unwrap((await api.get("/crypto/transfers")).data);
const createTransfer = async (payload) => unwrap((await api.post("/crypto/transfers", payload)).data);

const fetchSchemes = async () => unwrap((await api.get("/crypto/schemes")).data);
const createSchemeApi = async (payload) => unwrap((await api.post("/crypto/schemes", payload)).data);
const deleteSchemeApi = async (id) => unwrap((await api.delete(`/crypto/schemes/${id}`)).data);

// =====================================================
// UI PRIMITIVES
// =====================================================
const Modal = ({ open, title, subtitle, children, onClose, footer, width = 860 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 2000,
      }}
    >
      <div
        className="modal-card"
        style={{
          width: `min(${width}px, 100%)`,
          background: "white",
          borderRadius: 14,
          border: "1px solid #e2e8f0",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            background: "#f8fafc",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 16 }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            title="Закрыть"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "white",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>{children}</div>

        {footer ? (
          <div
            style={{
              padding: "14px 18px",
              borderTop: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const Field = ({ label, hint, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#475569" }}>{label}</div>
      {hint ? <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div> : null}
    </div>
    {children}
  </div>
);

const EmptyState = ({ title, text, action }) => (
  <div className="card" style={{ padding: 18, textAlign: "center" }}>
    <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 16 }}>{title}</div>
    <div style={{ marginTop: 8, color: "#64748b", fontSize: 13, lineHeight: 1.4 }}>{text}</div>
    {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
  </div>
);

const ProviderInput = ({ value, onChange, listId = "providers-any", placeholder = "Например: Binance / Ledger / Kaspi" }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input className="text-input" list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={listId}>
        {PROVIDERS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PROVIDERS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            style={{
              fontSize: 12,
              fontWeight: 900,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              color: "#334155",
            }}
            title="Быстро выбрать"
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8" }}>Можно выбрать из подсказок или написать свой провайдер вручную.</div>
    </div>
  );
};

// =====================================================
// REACT FLOW NODE
// =====================================================
const AccountNode = ({ data }) => {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        background: "white",
        border: "1px solid #e2e8f0",
        boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
        minWidth: 190,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "#7c3aed", width: 10, height: 10 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase" }}>{data.provider || "Provider"}</div>
          <div
            style={{
              fontWeight: 900,
              color: "#0f172a",
              fontSize: 14,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data.name || "Account"}
          </div>
        </div>
        {data.badge ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              color: "#0ea5e9",
              background: "#e0f2fe",
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #bae6fd",
              whiteSpace: "nowrap",
            }}
          >
            {data.badge}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "#7c3aed", width: 10, height: 10 }} />
    </div>
  );
};
const nodeTypes = { accountNode: AccountNode };

// =====================================================
// MODALS: Edge Tx + Save Scheme
// =====================================================
const EdgeTxModal = ({ open, onClose, onSubmit, fromTitle, toTitle }) => {
  const [form, setForm] = useState({ type: "transfer", amount: "", asset: "USDT", comment: "" });

  useEffect(() => {
    if (!open) return;
    setForm({ type: "transfer", amount: "", asset: "USDT", comment: "" });
  }, [open]);

  const submit = () => {
    const amount = Number(form.amount);
    if (!form.amount) return toast.warning("Введите сумму");
    if (Number.isNaN(amount)) return toast.warning("Сумма должна быть числом");
    const asset = (form.asset || "").trim().toUpperCase();
    if (!asset) return toast.warning("Введите актив (например USDT)");
    // В схеме всегда transfer
    onSubmit?.({ type: "transfer", amount, asset, comment: form.comment || "" });
  };

  return (
    <Modal
      open={open}
      title="Операция по стрелке"
      subtitle={`${fromTitle}  →  ${toTitle}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" onClick={submit}>
            Создать стрелку
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <Field label="Тип операции">
          {/* В схеме оставляем только "Перевод" */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(1, 1fr)", gap: 10 }}>
            {EDGE_TX_TYPES.map((t) => {
              const Icon = t.icon;
              const active = form.type === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setForm((p) => ({ ...p, type: t.id }))}
                  type="button"
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${active ? "#3b82f6" : "#e2e8f0"}`,
                    background: active ? "#eff6ff" : "#fff",
                    padding: "10px 10px",
                    cursor: "pointer",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    color: active ? "#2563eb" : "#334155",
                  }}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Актив" hint="USDT, BTC, ETH...">
          <input
            className="text-input"
            value={form.asset}
            onChange={(e) => setForm((p) => ({ ...p, asset: (e.target.value || "").toUpperCase() }))}
            placeholder="USDT"
          />
        </Field>

        <Field label="Сумма" hint="Число">
          <input
            className="text-input"
            type="number"
            step="0.00000001"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="1000"
          />
        </Field>

        <Field label="Комментарий" hint="необязательно">
          <input
            className="text-input"
            value={form.comment}
            onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
            placeholder="Например: распределение маржи"
          />
        </Field>

        <div
          style={{
            gridColumn: "1 / -1",
            fontSize: 12,
            color: "#64748b",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 12,
          }}
        >
          Подсказка: стрелки в схеме — это переводы между счетами. Пополнение/вывод добавляй через “Операция”
          (External).
        </div>
      </div>
    </Modal>
  );
};

const SaveSchemeModal = ({ open, onClose, onSave }) => {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
  }, [open]);

  const submit = () => {
    const n = name.trim();
    if (!n) return toast.warning("Введите название схемы");
    onSave?.(n);
  };

  return (
    <Modal
      open={open}
      title="Сохранить схему"
      subtitle="Задай понятное название: например “Декабрь 2025” или “Клиент A — потоки”"
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim()} style={{ opacity: !name.trim() ? 0.6 : 1 }}>
            Сохранить
          </button>
        </>
      }
    >
      <Field label="Название схемы">
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Основной поток / Январь 2026" autoFocus />
      </Field>
      <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>Схема сохраняет расположение узлов и стрелки (edges).</div>
    </Modal>
  );
};

// =====================================================
// VISUAL EDITOR
// =====================================================
const VisualEditorModal = ({ accounts, initialData, onClose, onAddTransfer, onSaveScheme }) => {
  const computedNodes =
    initialData?.nodes ||
    (accounts || []).map((acc, index) => ({
      id: acc.id.toString(),
      type: "accountNode",
      position: { x: 120 + index * 240, y: 130 + (index % 2 ? 90 : 0) },
      data: { provider: acc.provider, name: acc.name, badge: acc.asset || "" },
    }));

  const computedEdges = initialData?.edges || [];

  // ВАЖНО: если схема старая, но аккаунт переименовали — подтянуть актуальные названия/провайдер/актив
  const accountsById = useMemo(() => {
    const m = new Map();
    (accounts || []).forEach((a) => m.set(String(a.id), a));
    return m;
  }, [accounts]);

  const mergedNodes = useMemo(() => {
    return (computedNodes || []).map((n) => {
      const a = accountsById.get(String(n.id));
      if (!a) return n;
      return {
        ...n,
        data: {
          ...n.data,
          provider: a.provider,
          name: a.name,
          badge: a.asset || "",
        },
      };
    });
  }, [computedNodes, accountsById]);

  const [nodes, setNodes, onNodesChange] = useNodesState(mergedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(mergedNodes);
    setEdges(computedEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.id, accounts, initialData?.nodes, initialData?.edges, mergedNodes]);

  const [pendingConnect, setPendingConnect] = useState(null);
  const [openEdgeModal, setOpenEdgeModal] = useState(false);
  const [openSaveScheme, setOpenSaveScheme] = useState(false);

  const onConnect = useCallback(
    (params) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (!sourceNode || !targetNode) return;

      setPendingConnect({ params, fromNode: sourceNode, toNode: targetNode });
      setOpenEdgeModal(true);
    },
    [nodes]
  );

  const confirmEdge = async (tx) => {
    if (!pendingConnect) return;

    const { params, fromNode, toNode } = pendingConnect;

    // На всякий случай: принудительно transfer
    const safeTx = { ...tx, type: "transfer" };
    const label = edgeLabelFromTx(safeTx);

    const newEdge = {
      ...params,
      animated: true,
      label,
      data: { tx: safeTx },
      style: { stroke: "#7c3aed", strokeWidth: 2 },
      labelStyle: { fill: "#7c3aed", fontWeight: 900 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" },
    };

    setEdges((eds) => addEdge(newEdge, eds));

    try {
      await onAddTransfer?.({
        type: "transfer",
        amount: safeTx.amount,
        asset: safeTx.asset,
        comment: safeTx.comment,
        fromId: Number(fromNode.id),
        toId: Number(toNode.id),
        date: new Date().toISOString().slice(0, 10),
        label,
      });
      toast.success("Стрелка добавлена");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка сохранения операции");
    }

    setOpenEdgeModal(false);
    setPendingConnect(null);
  };

  const doSaveScheme = (name) => {
    onSaveScheme?.(name, nodes, edges);
    setOpenSaveScheme(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "white", zIndex: 2100, display: "flex", flexDirection: "column" }}>
      <EdgeTxModal
        open={openEdgeModal}
        onClose={() => {
          setOpenEdgeModal(false);
          setPendingConnect(null);
        }}
        onSubmit={confirmEdge}
        fromTitle={pendingConnect ? `${pendingConnect.fromNode.data.provider} — ${pendingConnect.fromNode.data.name}` : ""}
        toTitle={pendingConnect ? `${pendingConnect.toNode.data.provider} — ${pendingConnect.toNode.data.name}` : ""}
      />

      <SaveSchemeModal open={openSaveScheme} onClose={() => setOpenSaveScheme(false)} onSave={doSaveScheme} />

      <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>Визуальный редактор потоков</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>Соединяй счета стрелками. Сумма вводится в модалке.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setOpenSaveScheme(true)} className="btn-primary" style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }} disabled={nodes.length === 0}>
            <Save size={16} /> Сохранить схему
          </button>
          <button
            onClick={onClose}
            style={{ border: "1px solid #e2e8f0", background: "white", borderRadius: 10, width: 40, height: 40, cursor: "pointer", display: "grid", placeItems: "center" }}
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, background: "#f8fafc" }}>
        {(accounts || []).length === 0 ? (
          <div style={{ padding: 16 }}>
            <EmptyState
              title="Нет счетов для схемы"
              text="Сначала добавь хотя бы один счет. Потом откроем редактор и нарисуем потоки."
              action={<div style={{ color: "#94a3b8", fontSize: 12 }}>Закрой редактор и создай счет слева.</div>}
            />
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView>
            <Controls />
            <MiniMap style={{ height: 120 }} />
            <Background color="#cbd5e1" variant="dots" gap={20} size={1} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};

// =====================================================
// CRYPTO TAB
// =====================================================
const CryptoTab = () => {
  const [showVisualEditor, setShowVisualEditor] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [schemeToLoad, setSchemeToLoad] = useState(null);

  const [loading, setLoading] = useState(true);

  const [openAccModal, setOpenAccModal] = useState(false);
  const [openTransferModal, setOpenTransferModal] = useState(false);

  const [editingAcc, setEditingAcc] = useState(null);
  const [accForm, setAccForm] = useState({ provider: "", name: "", asset: "" });

  const [transferForm, setTransferForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "transfer",
    fromId: "",
    toId: "",
    amount: "",
    asset: "USDT",
    comment: "",
  });

  const refreshCrypto = useCallback(async () => {
    setLoading(true);
    try {
      const [accsRaw, txsRaw, schemesRaw] = await Promise.all([
        fetchCryptoAccounts(),
        fetchTransfers(),
        fetchSchemes().catch(() => []),
      ]);

      const accs = Array.isArray(accsRaw) ? accsRaw : [];
      const txs = Array.isArray(txsRaw) ? txsRaw.map(normalizeTransfer) : [];
      const sch = Array.isArray(schemesRaw) ? schemesRaw : [];

      setAccounts(accs);
      setTransfers(txs);
      setSchemes(sch);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка загрузки данных");
      setAccounts([]);
      setTransfers([]);
      setSchemes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCrypto();
  }, [refreshCrypto]);

  const groupedAccounts = useMemo(() => {
    return (accounts || []).reduce((acc, item) => {
      const key = item.provider || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [accounts]);

  const openCreateAccount = () => {
    setEditingAcc(null);
    setAccForm({ provider: "", name: "", asset: "" });
    setOpenAccModal(true);
  };

  const openEditAccount = (acc) => {
    setEditingAcc(acc);
    setAccForm({ provider: acc.provider || "", name: acc.name || "", asset: acc.asset || "" });
    setOpenAccModal(true);
  };

  const saveAccount = async () => {
    if (!accForm.provider.trim() || !accForm.name.trim()) return toast.warning("Заполните провайдер и название счета");

    const payload = {
      provider: accForm.provider.trim(),
      name: accForm.name.trim(),
      asset: (accForm.asset || "").trim().toUpperCase(),
    };

    try {
      if (editingAcc) {
        await updateCryptoAccount(editingAcc.id, payload);
        toast.info("Счет обновлен");
      } else {
        await createCryptoAccount(payload);
        toast.success("Счет добавлен");
      }
      setOpenAccModal(false);
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка при сохранении счета");
    }
  };

  const deleteAccount = async (id) => {
    if (!window.confirm("Удалить счет?")) return;
    try {
      await deleteCryptoAccount(id);
      toast.info("Счет удален");
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка при удалении счета");
    }
  };

  const openTransfer = () => {
    setTransferForm({
      date: new Date().toISOString().slice(0, 10),
      type: "transfer",
      fromId: "",
      toId: "",
      amount: "",
      asset: "USDT",
      comment: "",
    });
    setOpenTransferModal(true);
  };

  const saveTransfer = async () => {
    const { fromId, toId, amount, asset, date, comment, type } = transferForm;

    if (!amount) return toast.warning("Введите сумму");
    const amountNum = Number(amount);
    if (Number.isNaN(amountNum)) return toast.warning("Сумма должна быть числом");

    const assetUp = (asset || "").trim().toUpperCase();
    if (!assetUp) return toast.warning("Введите актив");

    const fromAcc = fromId ? accounts.find((a) => String(a.id) === String(fromId)) : null;
    const toAcc = toId ? accounts.find((a) => String(a.id) === String(toId)) : null;

    if (type === "transfer") {
      if (!fromAcc || !toAcc) return toast.warning("Выберите Откуда и Куда");
      if (fromAcc.id === toAcc.id) return toast.warning("Нельзя переводить на тот же счет");
    } else if (type === "deposit") {
      if (!toAcc) return toast.warning("Для пополнения выберите “Куда”");
    } else if (type === "withdraw") {
      if (!fromAcc) return toast.warning("Для вывода выберите “Откуда”");
    }

    const label = edgeLabelFromTx({ type, amount: amountNum, asset: assetUp, comment });

    try {
      await createTransfer({
        date,
        type,
        amount: amountNum,
        asset: assetUp,
        comment: comment || "",
        fromId: fromAcc ? fromAcc.id : null,
        toId: toAcc ? toAcc.id : null,
        label,
      });

      setOpenTransferModal(false);
      toast.success("Операция записана");
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка при сохранении операции");
    }
  };

  const saveScheme = async (name, nodes, edges) => {
    try {
      await createSchemeApi({ name, nodes, edges });
      toast.success("Схема сохранена!");
      setShowVisualEditor(false);
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка сохранения схемы");
    }
  };

  const deleteScheme = async (id) => {
    if (!window.confirm("Удалить схему?")) return;
    try {
      await deleteSchemeApi(id);
      toast.info("Схема удалена");
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка удаления схемы");
    }
  };

  const addTransferFromVisual = async (payload) => {
    await createTransfer({
      date: payload.date,
      type: "transfer",
      amount: payload.amount,
      asset: payload.asset,
      comment: payload.comment || "",
      fromId: payload.fromId ?? null,
      toId: payload.toId ?? null,
      label: payload.label || edgeLabelFromTx(payload),
    });
    await refreshCrypto();
  };

  const openEmptyEditor = () => {
    setSchemeToLoad(null);
    setShowVisualEditor(true);
  };

  const loadScheme = (s) => {
    setSchemeToLoad(s);
    setShowVisualEditor(true);
  };

  const hasAccounts = (accounts || []).length > 0;

  return (
    <div style={{ display: "flex", gap: 16, height: "100%", overflow: "hidden" }}>
      {showVisualEditor ? (
        <VisualEditorModal
          accounts={accounts}
          initialData={schemeToLoad}
          onAddTransfer={addTransferFromVisual}
          onSaveScheme={saveScheme}
          onClose={() => setShowVisualEditor(false)}
        />
      ) : null}

      {/* MODAL: account */}
      <Modal
        open={openAccModal}
        title={editingAcc ? "Редактировать крипто-счет" : "Новый крипто-счет"}
        subtitle="Счет провайдера (биржа/кошелек). Он станет узлом в схеме."
        onClose={() => setOpenAccModal(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpenAccModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={saveAccount} disabled={!accForm.provider.trim() || !accForm.name.trim()} style={{ opacity: !accForm.provider.trim() || !accForm.name.trim() ? 0.6 : 1 }}>
              {editingAcc ? "Сохранить" : "Создать"}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Провайдер" hint="Выбери из подсказок или напиши свой">
            <ProviderInput value={accForm.provider} onChange={(v) => setAccForm((p) => ({ ...p, provider: v }))} listId="providers-crypto" placeholder="Например: Binance / Ledger / Metamask" />
          </Field>

          <Field label="Актив (необязательно)" hint="USDT / BTC / ETH...">
            <input className="text-input" value={accForm.asset} onChange={(e) => setAccForm((p) => ({ ...p, asset: (e.target.value || "").toUpperCase() }))} placeholder="USDT" />
          </Field>

          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Название счета" hint="Spot / Futures / Cold Storage...">
              <input className="text-input" value={accForm.name} onChange={(e) => setAccForm((p) => ({ ...p, name: e.target.value }))} placeholder="Spot Wallet" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* MODAL: transfer */}
      <Modal
        open={openTransferModal}
        title="Добавить операцию"
        subtitle="Запись попадет в историю. Для визуализации — используй схему потоков."
        onClose={() => setOpenTransferModal(false)}
        width={820}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpenTransferModal(false)}>
              Отмена
            </button>
            <button
              className="btn-primary"
              onClick={saveTransfer}
              disabled={
                !transferForm.amount ||
                !transferForm.asset.trim() ||
                (transferForm.type === "transfer" && (!transferForm.fromId || !transferForm.toId)) ||
                (transferForm.type === "deposit" && !transferForm.toId) ||
                (transferForm.type === "withdraw" && !transferForm.fromId)
              }
              style={{
                opacity:
                  !transferForm.amount ||
                  !transferForm.asset.trim() ||
                  (transferForm.type === "transfer" && (!transferForm.fromId || !transferForm.toId)) ||
                  (transferForm.type === "deposit" && !transferForm.toId) ||
                  (transferForm.type === "withdraw" && !transferForm.fromId)
                    ? 0.6
                    : 1,
              }}
            >
              Записать
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Дата">
            <input type="date" className="text-input" value={transferForm.date} onChange={(e) => setTransferForm((p) => ({ ...p, date: e.target.value }))} />
          </Field>

          <Field label="Тип операции">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {TX_TYPES.map((t) => {
                const Icon = t.icon;
                const active = transferForm.type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTransferForm((p) => ({ ...p, type: t.id }))}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${active ? "#3b82f6" : "#e2e8f0"}`,
                      background: active ? "#eff6ff" : "#fff",
                      padding: "10px 10px",
                      cursor: "pointer",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      color: active ? "#2563eb" : "#334155",
                    }}
                  >
                    <Icon size={16} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Сумма">
            <input className="text-input" type="number" step="0.00000001" value={transferForm.amount} onChange={(e) => setTransferForm((p) => ({ ...p, amount: e.target.value }))} placeholder="1000" />
          </Field>

          <Field label="Актив">
            <input className="text-input" value={transferForm.asset} onChange={(e) => setTransferForm((p) => ({ ...p, asset: (e.target.value || "").toUpperCase() }))} placeholder="USDT" />
          </Field>

          <Field label="Откуда" hint={transferForm.type === "deposit" ? "Для пополнения можно оставить External" : ""}>
            <select className="text-input" value={transferForm.fromId} onChange={(e) => setTransferForm((p) => ({ ...p, fromId: e.target.value }))}>
              <option value="">(External)</option>
              {(accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.provider} — {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Куда" hint={transferForm.type === "withdraw" ? "Для вывода можно оставить External" : ""}>
            <select className="text-input" value={transferForm.toId} onChange={(e) => setTransferForm((p) => ({ ...p, toId: e.target.value }))}>
              <option value="">(External)</option>
              {(accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.provider} — {a.name}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Комментарий (необязательно)">
              <input className="text-input" value={transferForm.comment} onChange={(e) => setTransferForm((p) => ({ ...p, comment: e.target.value }))} placeholder="Например: распределение маржи" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* LEFT */}
      <div style={{ width: 360, display: "flex", flexDirection: "column", gap: 14, flexShrink: 0, overflowY: "auto" }}>
        <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={openCreateAccount} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
            <Plus size={18} /> Добавить счет
          </button>
          <button className="btn-secondary" onClick={openTransfer} disabled={!hasAccounts} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center", opacity: !hasAccounts ? 0.6 : 1 }} title={!hasAccounts ? "Сначала добавьте счет" : ""}>
            <History size={18} /> Операция
          </button>
        </div>

        <div
          className="card-gradient"
          onClick={() => (hasAccounts ? openEmptyEditor() : toast.info("Сначала добавь хотя бы один счет"))}
          style={{ cursor: "pointer", padding: 16, color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: hasAccounts ? 1 : 0.75 }}
          title={!hasAccounts ? "Добавьте счет, затем откройте схему" : ""}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Схема потоков</div>
            <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>Открыть визуальный редактор</div>
          </div>
          <Maximize2 size={22} />
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", background: "#f1f5f9", fontWeight: 900, color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
            <FolderOpen size={18} /> Схемы
          </div>

          <div>
            {schemes.length === 0 ? (
              <div style={{ padding: 12 }}>
                <EmptyState title="Схем пока нет" text="Нарисуй потоки в редакторе и сохрани схему, чтобы быстро возвращаться к структуре." action={<button className="btn-primary" onClick={() => (hasAccounts ? openEmptyEditor() : toast.info("Сначала добавь счет"))}>Открыть редактор</button>} />
              </div>
            ) : (
              schemes.map((s) => (
                <div key={s.id} className="list-item" style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div onClick={() => loadScheme(s)} style={{ cursor: "pointer", flex: 1 }}>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{s.created_at ? String(s.created_at).slice(0, 10) : ""}</div>
                  </div>
                  <Trash2 size={16} style={{ cursor: "pointer", color: "#cbd5e1" }} onClick={() => deleteScheme(s.id)} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 12 }}>
          <button className="btn-secondary" onClick={refreshCrypto} style={{ width: "100%" }}>
            Обновить данные
          </button>
          {loading ? <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>Загрузка...</div> : null}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
        <div style={{ flex: "0 0 auto", maxHeight: "40%", overflowY: "auto" }}>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Счета</h3>

          {loading ? (
            <div style={{ marginTop: 12, color: "#64748b" }}>Загрузка...</div>
          ) : accounts.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <EmptyState title="Счетов пока нет" text="Создай первый счет (биржа/кошелек). После этого можно добавлять операции и строить схему потоков." action={<button className="btn-primary" onClick={openCreateAccount}><Plus size={16} style={{ verticalAlign: "middle", marginRight: 8 }} />Добавить счет</button>} />
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {Object.keys(groupedAccounts).map((prov) => (
                <div key={prov} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ background: "#f8fafc", padding: "10px 12px", fontWeight: 900, color: "#475569", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{prov}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 900 }}>{groupedAccounts[prov].length}</span>
                  </div>

                  <div style={{ padding: 10 }}>
                    {groupedAccounts[prov].map((acc) => (
                      <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #f1f5f9", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.name}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            {acc.asset ? (
                              <>Актив: <b>{acc.asset}</b></>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>Актив: не указан</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="icon-pill" title="Редактировать" onClick={() => openEditAccount(acc)}><Pencil size={14} /></button>
                          <button className="icon-pill danger" title="Удалить" onClick={() => deleteAccount(acc.id)}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ flex: 1, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", borderTop: "4px solid #10b981" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <History size={18} color="#10b981" />
              <h3 style={{ margin: 0 }}>История операций</h3>
            </div>

            <button className="btn-secondary" onClick={openTransfer} disabled={!hasAccounts} style={{ display: "flex", alignItems: "center", gap: 8, opacity: !hasAccounts ? 0.6 : 1 }}>
              <Plus size={16} /> Добавить
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 12, color: "#64748b" }}>Загрузка...</div>
            ) : transfers.length === 0 ? (
              <div style={{ padding: 12 }}>
                <EmptyState title="Операций пока нет" text="Добавь первую операцию. Для визуализации потоков открой “Схему потоков”." action={<button className="btn-primary" onClick={openTransfer} disabled={!hasAccounts} style={{ opacity: !hasAccounts ? 0.6 : 1 }}>Добавить операцию</button>} />
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#64748b" }}>Дата</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#64748b" }}>Тип</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#64748b" }}>Откуда</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#64748b" }}>Куда</th>
                    <th style={{ textAlign: "right", padding: "12px 16px", color: "#64748b" }}>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t0) => {
                    const t = normalizeTransfer(t0);
                    const typeLabel = TX_TYPES.find((x) => x.id === t.type)?.label || "Операция";

                    const fromAcc =
                      t.from ||
                      (t.fromId
                        ? (() => {
                            const a = accounts.find((x) => String(x.id) === String(t.fromId));
                            return a ? `${a.provider} - ${a.name}` : "";
                          })()
                        : "External");

                    const toAcc =
                      t.to ||
                      (t.toId
                        ? (() => {
                            const a = accounts.find((x) => String(x.id) === String(t.toId));
                            return a ? `${a.provider} - ${a.name}` : "";
                          })()
                        : "External");

                    return (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 16px", color: "#94a3b8", whiteSpace: "nowrap" }}>{t.date}</td>
                        <td style={{ padding: "10px 16px", fontWeight: 900, color: "#334155" }}>{typeLabel}</td>
                        <td style={{ padding: "10px 16px", fontWeight: 900 }}>{fromAcc}</td>
                        <td style={{ padding: "10px 16px", fontWeight: 900 }}>{toAcc}</td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 900, color: "#3b82f6" }}>
                          {fmtAmount(t.amount)} {t.asset}
                          {t.comment ? ` • ${t.comment}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// MAIN PAGE (ONLY CRYPTO)
// =====================================================
const AccountsPage = () => {
  return (
    <div style={{ padding: 18, height: "100vh", display: "flex", flexDirection: "column", background: "#f8fafc", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, color: "#0f172a", display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
          <Wallet color="#7c3aed" /> Крипто счета
        </h1>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <CryptoTab />
      </div>

      <style>{`
        .text-input{
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 14px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          background: white;
        }
        .text-input:focus{
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }
        .btn-primary{
          background: #3b82f6;
          color: white;
          border: 1px solid #3b82f6;
          padding: 10px 14px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 900;
        }
        .btn-primary:disabled{ cursor: not-allowed; }
        .btn-secondary{
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          padding: 10px 14px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 900;
        }
        .btn-secondary:hover{ background:#f8fafc; }
        .btn-secondary:disabled{ cursor: not-allowed; }
        .card{
          background: white;
          border-radius: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          border: 1px solid #e2e8f0;
        }
        .card-gradient{
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border-radius: 14px;
          box-shadow: 0 10px 24px rgba(79,70,229,0.25);
          transition: transform .15s ease;
        }
        .card-gradient:hover{ transform: translateY(-1px); }
        .list-item:hover{ background:#f8fafc; }
        .icon-pill{
          border: 1px solid #e2e8f0;
          background: #fff;
          border-radius: 10px;
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          cursor: pointer;
          color: #334155;
        }
        .icon-pill:hover{ background:#f8fafc; }
        .icon-pill.danger{ border-color: #fecaca; color:#ef4444; }
      `}</style>
    </div>
  );
};

export default AccountsPage;
