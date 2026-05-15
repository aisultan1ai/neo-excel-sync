import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { X, Save } from "lucide-react";
import ReactFlow, {
  MiniMap, Controls, Background,
  useNodesState, useEdgesState, addEdge,
} from "reactflow";
import "reactflow/dist/style.css";

import Modal from "../../components/Modal";
import Field from "../../components/Field";
import EmptyState from "../../components/EmptyState";
import AccountNode from "./AccountNode";
import { EDGE_TX_TYPES, edgeLabelFromTx, normalizeEdge } from "./helpers";

const nodeTypes = { accountNode: AccountNode };

// ─── EdgeTxModal ─────────────────────────────────────────────────────────────

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
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit}>Создать стрелку</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <Field label="Тип операции">
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
                    padding: "10px 10px", cursor: "pointer",
                    display: "flex", gap: 8, alignItems: "center", justifyContent: "center",
                    fontWeight: 600, color: active ? "#2563eb" : "#334155",
                  }}
                >
                  <Icon size={16} />{t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Актив" hint="USDT, BTC, ETH...">
          <input
            className="text-input" value={form.asset}
            onChange={(e) => setForm((p) => ({ ...p, asset: (e.target.value || "").toUpperCase() }))}
            placeholder="USDT"
          />
        </Field>

        <Field label="Сумма" hint="Число">
          <input
            className="text-input" type="number" step="0.00000001"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="1000"
          />
        </Field>

        <Field label="Комментарий" hint="необязательно">
          <input
            className="text-input" value={form.comment}
            onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
            placeholder="Например: распределение маржи"
          />
        </Field>

        <div
          style={{
            gridColumn: "1 / -1", fontSize: 12, color: "#64748b",
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 12, padding: 12,
          }}
        >
          Подсказка: стрелки в схеме — это переводы между счетами.
          Пополнение/вывод добавляй через "Операция" (External).
        </div>
      </div>
    </Modal>
  );
};

// ─── SaveSchemeModal ──────────────────────────────────────────────────────────

const SaveSchemeModal = ({ open, onClose, onSave }) => {
  const [name, setName] = useState("");

  useEffect(() => { if (!open) return; setName(""); }, [open]);

  const submit = () => {
    const n = name.trim();
    if (!n) return toast.warning("Введите название схемы");
    onSave?.(n);
  };

  return (
    <Modal
      open={open}
      title="Сохранить схему"
      subtitle='Задай понятное название: например "Декабрь 2025" или "Клиент A — потоки"'
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button
            className="btn-primary" onClick={submit}
            disabled={!name.trim()} style={{ opacity: !name.trim() ? 0.6 : 1 }}
          >
            Сохранить
          </button>
        </>
      }
    >
      <Field label="Название схемы">
        <input
          className="text-input" value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Основной поток / Январь 2026"
          autoFocus
        />
      </Field>
      <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
        Схема сохраняет расположение узлов и стрелки (edges).
      </div>
    </Modal>
  );
};

// ─── VisualEditorModal ────────────────────────────────────────────────────────

const VisualEditorModal = ({ accounts, initialData, onClose, onAddTransfer, onSaveScheme }) => {
  const baseNodes = useMemo(() => {
    if (initialData?.nodes && Array.isArray(initialData.nodes) && initialData.nodes.length > 0) {
      return initialData.nodes;
    }
    return (accounts || []).map((acc, index) => ({
      id: String(acc.id),
      type: "accountNode",
      position: { x: 120 + index * 240, y: 130 + (index % 2 ? 110 : 0) },
      data: { provider: acc.provider, name: acc.name, badge: acc.asset || "" },
    }));
  }, [initialData?.id, accounts]);

  const baseEdges = useMemo(() => {
    if (initialData?.edges && Array.isArray(initialData.edges)) {
      return initialData.edges.map(normalizeEdge);
    }
    return [];
  }, [initialData?.id]);

  const accountsById = useMemo(() => {
    const m = new Map();
    (accounts || []).forEach((a) => m.set(String(a.id), a));
    return m;
  }, [accounts]);

  const mergedNodes = useMemo(() =>
    (baseNodes || []).map((n) => {
      const a = accountsById.get(String(n.id));
      if (!a) return n;
      return { ...n, data: { ...n.data, provider: a.provider, name: a.name, badge: a.asset || "" } };
    }),
  [baseNodes, accountsById]);

  const [nodes, setNodes, onNodesChange] = useNodesState(mergedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  useEffect(() => {
    setNodes(mergedNodes);
    setEdges(baseEdges);
  }, [mergedNodes, baseEdges, setNodes, setEdges]);

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
    const safeTx = { ...tx, type: "transfer" };
    const label = edgeLabelFromTx(safeTx);
    const edgeId = `e-${params.source}-${params.target}-${Date.now()}`;
    const newEdge = normalizeEdge({ ...params, id: params.id || edgeId, label, data: { tx: safeTx } });
    setEdges((eds) => addEdge(newEdge, eds));

    try {
      await onAddTransfer?.({
        type: "transfer", amount: safeTx.amount, asset: safeTx.asset,
        comment: safeTx.comment, fromId: Number(fromNode.id), toId: Number(toNode.id),
        date: new Date().toISOString().slice(0, 10), label,
      });
      toast.success("Стрелка добавлена");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка сохранения операции");
    }

    setOpenEdgeModal(false);
    setPendingConnect(null);
  };

  const doSaveScheme = (name) => {
    onSaveScheme?.(name, nodes || [], (edges || []).map(normalizeEdge));
    setOpenSaveScheme(false);
  };

  const defaultEdgeOptions = useMemo(() => normalizeEdge({ animated: true, data: {}, label: "" }), []);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "white", zIndex: 2100, display: "flex", flexDirection: "column" }}
      tabIndex={-1}
    >
      <EdgeTxModal
        open={openEdgeModal}
        onClose={() => { setOpenEdgeModal(false); setPendingConnect(null); }}
        onSubmit={confirmEdge}
        fromTitle={pendingConnect ? `${pendingConnect.fromNode.data.provider} — ${pendingConnect.fromNode.data.name}` : ""}
        toTitle={pendingConnect ? `${pendingConnect.toNode.data.provider} — ${pendingConnect.toNode.data.name}` : ""}
      />

      <SaveSchemeModal
        open={openSaveScheme}
        onClose={() => setOpenSaveScheme(false)}
        onSave={doSaveScheme}
      />

      <div
        style={{
          padding: "14px 18px", borderBottom: "1px solid #e2e8f0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#f8fafc",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>Визуальный редактор потоков</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
            Соединяй счета стрелками. Сумма вводится в модалке. (Удалить стрелку: выдели → Del)
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setOpenSaveScheme(true)}
            className="btn-primary"
            style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}
            disabled={(nodes || []).length === 0}
          >
            <Save size={16} /> Сохранить схему
          </button>
          <button
            onClick={onClose}
            style={{
              border: "1px solid #e2e8f0", background: "white",
              borderRadius: 10, width: 40, height: 40,
              cursor: "pointer", display: "grid", placeItems: "center",
            }}
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
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} nodeTypes={nodeTypes} fitView
            deleteKeyCode={["Backspace", "Delete"]}
            selectionKeyCode={["Shift"]}
            defaultEdgeOptions={defaultEdgeOptions}
          >
            <Controls />
            <MiniMap style={{ height: 120 }} />
            <Background color="#cbd5e1" variant="dots" gap={20} size={1} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};

export default VisualEditorModal;
