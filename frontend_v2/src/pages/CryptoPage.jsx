import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { api } from "../api/client";

const PROVIDERS = ["Binance", "ByBit", "OKX", "HRP", "Winermute"];

const TX_TYPES = [
  { id: "transfer", label: "Перевод", icon: Shuffle },
  { id: "deposit", label: "Пополнение", icon: ArrowDownToLine },
  { id: "withdraw", label: "Вывод", icon: ArrowUpFromLine },
];

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

const normalizeTransfer = (t) => ({
  ...t,
  fromId: t.fromId ?? t.from_account_id ?? t.fromAccountId ?? null,
  toId: t.toId ?? t.to_account_id ?? t.toAccountId ?? null,
});

const normalizeEdge = (e) => {
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

const fetchCryptoAccounts = async () => {
  const res = await api.get("/api/v2/crypto/accounts");
  return res.data?.items || [];
};

const createCryptoAccount = async (payload) => {
  const res = await api.post("/api/v2/crypto/accounts", payload);
  return res.data?.item;
};

const updateCryptoAccount = async (id, payload) => {
  const res = await api.put(`/api/v2/crypto/accounts/${id}`, payload);
  return res.data?.item;
};

const deleteCryptoAccount = async (id) => {
  const res = await api.delete(`/api/v2/crypto/accounts/${id}`);
  return res.data;
};

const fetchTransfers = async () => {
  const res = await api.get("/api/v2/crypto/transfers");
  return res.data?.items || [];
};

const createTransfer = async (payload) => {
  const res = await api.post("/api/v2/crypto/transfers", payload);
  return res.data?.item;
};

const deleteTransferApi = async (id) => {
  const res = await api.delete(`/api/v2/crypto/transfers/${id}`);
  return res.data;
};

const fetchSchemes = async () => {
  const res = await api.get("/api/v2/crypto/schemes");
  return res.data?.items || [];
};

const createSchemeApi = async (payload) => {
  const res = await api.post("/api/v2/crypto/schemes", payload);
  return res.data?.item;
};

const deleteSchemeApi = async (id) => {
  const res = await api.delete(`/api/v2/crypto/schemes/${id}`);
  return res.data;
};

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
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal-backdrop")) onClose?.();
      }}
    >
      <div className="card crypto-modal-card" style={{ width: `min(${width}px, 100%)` }}>
        <div className="crypto-modal-head">
          <div>
            <div className="crypto-modal-title">{title}</div>
            {subtitle ? <div className="crypto-modal-subtitle">{subtitle}</div> : null}
          </div>

          <button className="icon-btn" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="crypto-modal-body">{children}</div>

        {footer ? <div className="crypto-modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
};

const useConfirm = () => {
  const [cfg, setCfg] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setCfg({
        open: true,
        title: options?.title || "Подтверждение",
        subtitle: options?.subtitle || "",
        confirmText: options?.confirmText || "Да",
        cancelText: options?.cancelText || "Отмена",
        danger: !!options?.danger,
      });
    });
  }, []);

  const close = useCallback((result) => {
    setCfg(null);
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.(result);
  }, []);

  const ConfirmDialog = useCallback(() => {
    if (!cfg?.open) return null;

    return (
      <Modal
        open={cfg.open}
        title={cfg.title}
        subtitle={cfg.subtitle}
        onClose={() => close(false)}
        width={560}
        footer={
          <>
            <button className="secondary-btn" onClick={() => close(false)} type="button">
              {cfg.cancelText}
            </button>

            <button
              className="save-btn"
              onClick={() => close(true)}
              type="button"
              style={{
                background: cfg.danger ? "#ef4444" : undefined,
                borderColor: cfg.danger ? "#ef4444" : undefined,
              }}
            >
              {cfg.confirmText}
            </button>
          </>
        }
      >
        <div className="crypto-confirm-box">
          {cfg.danger ? <div className="crypto-confirm-danger">Действие необратимо.</div> : null}
          <div>Подтвердить действие?</div>
        </div>
      </Modal>
    );
  }, [cfg, close]);

  return { confirm, ConfirmDialog };
};

const Field = ({ label, hint, children }) => (
  <div className="crypto-field">
    <div className="crypto-field-head">
      <div className="crypto-field-label">{label}</div>
      {hint ? <div className="crypto-field-hint">{hint}</div> : null}
    </div>
    {children}
  </div>
);

const EmptyState = ({ title, text, action }) => (
  <div className="card crypto-empty-state">
    <div className="crypto-empty-title">{title}</div>
    <div className="crypto-empty-text">{text}</div>
    {action ? <div className="crypto-empty-action">{action}</div> : null}
  </div>
);

const ProviderInput = ({
  value,
  onChange,
  listId = "providers-any",
  placeholder = "Например: Binance / Ledger / Kaspi",
}) => {
  return (
    <div className="crypto-provider-input">
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />

      <datalist id={listId}>
        {PROVIDERS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="crypto-provider-tags">
        {PROVIDERS.map((p) => (
          <button key={p} type="button" className="crypto-provider-pill" onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="crypto-provider-note">
        Можно выбрать из подсказок или написать свой провайдер вручную.
      </div>
    </div>
  );
};

const AccountNode = ({ data }) => {
  return (
    <div className="crypto-node-card">
      <Handle type="target" position={Position.Top} style={{ background: "#7c3aed", width: 10, height: 10 }} />

      <div className="crypto-node-head">
        <div>
          <div className="crypto-node-provider">{data.provider || "Provider"}</div>
          <div className="crypto-node-name">{data.name || "Account"}</div>
        </div>

        {data.badge ? <div className="crypto-node-badge">{data.badge}</div> : null}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: "#7c3aed", width: 10, height: 10 }} />
    </div>
  );
};

const nodeTypes = { accountNode: AccountNode };

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
    if (!asset) return toast.warning("Введите актив");

    onSubmit?.({ type: "transfer", amount, asset, comment: form.comment || "" });
  };

  return (
    <Modal
      open={open}
      title="Операция по стрелке"
      subtitle={`${fromTitle} → ${toTitle}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="secondary-btn" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="save-btn" onClick={submit} type="button">
            Создать стрелку
          </button>
        </>
      }
    >
      <div className="crypto-grid-2">
        <Field label="Тип операции">
          <div className="crypto-type-grid">
            {EDGE_TX_TYPES.map((t) => {
              const Icon = t.icon;
              const active = form.type === t.id;

              return (
                <button
                  key={t.id}
                  onClick={() => setForm((p) => ({ ...p, type: t.id }))}
                  type="button"
                  className={`crypto-type-btn ${active ? "active" : ""}`}
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
            value={form.asset}
            onChange={(e) => setForm((p) => ({ ...p, asset: (e.target.value || "").toUpperCase() }))}
            placeholder="USDT"
          />
        </Field>

        <Field label="Сумма" hint="Число">
          <input
            type="number"
            step="0.00000001"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="1000"
          />
        </Field>

        <Field label="Комментарий" hint="необязательно">
          <input
            value={form.comment}
            onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
            placeholder="Например: распределение маржи"
          />
        </Field>

        <div className="crypto-help-box">
          Подсказка: стрелки в схеме — это переводы между счетами. Пополнение/вывод добавляй через
          “Операция” (External).
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
      subtitle="Например: Декабрь 2025 или Клиент A — потоки"
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="secondary-btn" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="save-btn" onClick={submit} type="button" disabled={!name.trim()}>
            Сохранить
          </button>
        </>
      }
    >
      <Field label="Название схемы">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Основной поток / Январь 2026"
          autoFocus
        />
      </Field>

      <div className="crypto-provider-note">Схема сохраняет расположение узлов и стрелки.</div>
    </Modal>
  );
};

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

  const mergedNodes = useMemo(() => {
    return (baseNodes || []).map((n) => {
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
  }, [baseNodes, accountsById]);

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

    const newEdge = normalizeEdge({
      ...params,
      id: params.id || edgeId,
      label,
      data: { tx: safeTx },
    });

    setEdges((eds) => addEdge(newEdge, eds));

    try {
      await onAddTransfer?.({
        type: "transfer",
        amount: safeTx.amount,
        asset: safeTx.asset,
        comment: safeTx.comment,
        from_account_id: Number(fromNode.id),
        to_account_id: Number(toNode.id),
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
    const safeEdges = (edges || []).map(normalizeEdge);
    const safeNodes = nodes || [];
    onSaveScheme?.(name, safeNodes, safeEdges);
    setOpenSaveScheme(false);
  };

  const defaultEdgeOptions = useMemo(
    () =>
      normalizeEdge({
        animated: true,
        data: {},
        label: "",
      }),
    []
  );

  return (
    <div className="crypto-editor-fullscreen" tabIndex={-1}>
      <EdgeTxModal
        open={openEdgeModal}
        onClose={() => {
          setOpenEdgeModal(false);
          setPendingConnect(null);
        }}
        onSubmit={confirmEdge}
        fromTitle={
          pendingConnect
            ? `${pendingConnect.fromNode.data.provider} — ${pendingConnect.fromNode.data.name}`
            : ""
        }
        toTitle={
          pendingConnect
            ? `${pendingConnect.toNode.data.provider} — ${pendingConnect.toNode.data.name}`
            : ""
        }
      />

      <SaveSchemeModal
        open={openSaveScheme}
        onClose={() => setOpenSaveScheme(false)}
        onSave={doSaveScheme}
      />

      <div className="crypto-editor-head">
        <div>
          <div className="crypto-editor-title">Визуальный редактор потоков</div>
          <div className="crypto-editor-subtitle">
            Соединяй счета стрелками. Сумма вводится в модалке. Удалить стрелку: выдели → Delete.
          </div>
        </div>

        <div className="crypto-editor-actions">
          <button
            onClick={() => setOpenSaveScheme(true)}
            className="save-btn"
            type="button"
            disabled={(nodes || []).length === 0}
          >
            <Save size={16} />
            <span>Сохранить схему</span>
          </button>

          <button className="icon-btn" onClick={onClose} type="button" title="Закрыть">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="crypto-editor-body">
        {(accounts || []).length === 0 ? (
          <div className="crypto-editor-empty-wrap">
            <EmptyState
              title="Нет счетов для схемы"
              text="Сначала добавь хотя бы один счет. Потом откроем редактор и нарисуем потоки."
              action={<div className="crypto-provider-note">Закрой редактор и создай счет слева.</div>}
            />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
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

function CryptoTab() {
  const { confirm, ConfirmDialog } = useConfirm();

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
    from_account_id: "",
    to_account_id: "",
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
    if (!accForm.provider.trim() || !accForm.name.trim()) {
      toast.warning("Заполните провайдер и название счета");
      return;
    }

    const payload = {
      provider: accForm.provider.trim(),
      name: accForm.name.trim(),
      asset: (accForm.asset || "").trim().toUpperCase() || null,
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
    const ok = await confirm({
      title: "Удалить счет?",
      subtitle: "Счет будет удален навсегда.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;

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
      from_account_id: "",
      to_account_id: "",
      amount: "",
      asset: "USDT",
      comment: "",
    });
    setOpenTransferModal(true);
  };

  const saveTransfer = async () => {
    const { from_account_id, to_account_id, amount, asset, date, comment, type } = transferForm;

    if (!amount) return toast.warning("Введите сумму");
    const amountNum = Number(amount);
    if (Number.isNaN(amountNum)) return toast.warning("Сумма должна быть числом");

    const assetUp = (asset || "").trim().toUpperCase();
    if (!assetUp) return toast.warning("Введите актив");

    const fromAcc = from_account_id
      ? accounts.find((a) => String(a.id) === String(from_account_id))
      : null;
    const toAcc = to_account_id
      ? accounts.find((a) => String(a.id) === String(to_account_id))
      : null;

    if (type === "transfer") {
      if (!fromAcc || !toAcc) return toast.warning("Выберите Откуда и Куда");
      if (fromAcc.id === toAcc.id) return toast.warning("Нельзя переводить на тот же счет");
    } else if (type === "deposit") {
      if (!toAcc) return toast.warning("Для пополнения выберите “Куда”");
    } else if (type === "withdraw") {
      if (!fromAcc) return toast.warning("Для вывода выберите “Откуда”");
    }

    try {
      await createTransfer({
        date,
        type,
        amount: amountNum,
        asset: assetUp,
        comment: comment || "",
        from_account_id: fromAcc ? fromAcc.id : null,
        to_account_id: toAcc ? toAcc.id : null,
        label: edgeLabelFromTx({ type, amount: amountNum, asset: assetUp, comment }),
      });

      setOpenTransferModal(false);
      toast.success("Операция записана");
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка при сохранении операции");
    }
  };

  const deleteTransfer = async (id) => {
    const ok = await confirm({
      title: "Удалить операцию?",
      subtitle: "Операция будет удалена навсегда и исчезнет из истории.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteTransferApi(id);
      toast.info("Операция удалена");
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка удаления операции");
    }
  };

  const saveScheme = async (name, nodes, edges) => {
    try {
      await createSchemeApi({ name, nodes, edges });
      toast.success("Схема сохранена");
      setShowVisualEditor(false);
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка сохранения схемы");
    }
  };

  const deleteScheme = async (id) => {
    const ok = await confirm({
      title: "Удалить схему?",
      subtitle: "Схема потоков будет удалена навсегда. Счета и операции не удаляются.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;

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
      from_account_id: payload.from_account_id ?? null,
      to_account_id: payload.to_account_id ?? null,
      label: payload.label || edgeLabelFromTx(payload),
    });
    await refreshCrypto();
  };

  const openEmptyEditor = () => {
    setSchemeToLoad(null);
    setShowVisualEditor(true);
  };

  const loadScheme = (s) => {
    const safe = {
      ...s,
      nodes: Array.isArray(s?.nodes) ? s.nodes : [],
      edges: Array.isArray(s?.edges) ? s.edges.map(normalizeEdge) : [],
    };
    setSchemeToLoad(safe);
    setShowVisualEditor(true);
  };

  const hasAccounts = (accounts || []).length > 0;

  return (
    <>
      <ConfirmDialog />

      <div className="crypto-shell">
        {showVisualEditor ? (
          <VisualEditorModal
            accounts={accounts}
            initialData={schemeToLoad}
            onAddTransfer={addTransferFromVisual}
            onSaveScheme={saveScheme}
            onClose={() => setShowVisualEditor(false)}
          />
        ) : null}

        <Modal
          open={openAccModal}
          title={editingAcc ? "Редактировать крипто-счет" : "Новый крипто-счет"}
          subtitle="Счет провайдера (биржа/кошелек). Он станет узлом в схеме."
          onClose={() => setOpenAccModal(false)}
          footer={
            <>
              <button className="secondary-btn" onClick={() => setOpenAccModal(false)} type="button">
                Отмена
              </button>
              <button
                className="save-btn"
                onClick={saveAccount}
                type="button"
                disabled={!accForm.provider.trim() || !accForm.name.trim()}
              >
                {editingAcc ? "Сохранить" : "Создать"}
              </button>
            </>
          }
        >
          <div className="crypto-grid-2">
            <Field label="Провайдер" hint="Выбери из подсказок или напиши свой">
              <ProviderInput
                value={accForm.provider}
                onChange={(v) => setAccForm((p) => ({ ...p, provider: v }))}
                listId="providers-crypto"
                placeholder="Например: Binance / Ledger / Metamask"
              />
            </Field>

            <Field label="Актив (необязательно)" hint="USDT / BTC / ETH...">
              <input
                value={accForm.asset}
                onChange={(e) => setAccForm((p) => ({ ...p, asset: (e.target.value || "").toUpperCase() }))}
                placeholder="USDT"
              />
            </Field>

            <div className="crypto-full-span">
              <Field label="Название счета" hint="Spot / Futures / Cold Storage...">
                <input
                  value={accForm.name}
                  onChange={(e) => setAccForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Spot Wallet"
                />
              </Field>
            </div>
          </div>
        </Modal>

        <Modal
          open={openTransferModal}
          title="Добавить операцию"
          subtitle="Запись попадет в историю. Для визуализации — используй схему потоков."
          onClose={() => setOpenTransferModal(false)}
          width={820}
          footer={
            <>
              <button className="secondary-btn" onClick={() => setOpenTransferModal(false)} type="button">
                Отмена
              </button>
              <button
                className="save-btn"
                onClick={saveTransfer}
                type="button"
                disabled={
                  !transferForm.amount ||
                  !transferForm.asset.trim() ||
                  (transferForm.type === "transfer" &&
                    (!transferForm.from_account_id || !transferForm.to_account_id)) ||
                  (transferForm.type === "deposit" && !transferForm.to_account_id) ||
                  (transferForm.type === "withdraw" && !transferForm.from_account_id)
                }
              >
                Записать
              </button>
            </>
          }
        >
          <div className="crypto-grid-2">
            <Field label="Дата">
              <input
                type="date"
                value={transferForm.date}
                onChange={(e) => setTransferForm((p) => ({ ...p, date: e.target.value }))}
              />
            </Field>

            <Field label="Тип операции">
              <div className="crypto-type-grid-3">
                {TX_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = transferForm.type === t.id;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`crypto-type-btn ${active ? "active" : ""}`}
                      onClick={() => setTransferForm((p) => ({ ...p, type: t.id }))}
                    >
                      <Icon size={16} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Сумма">
              <input
                type="number"
                step="0.00000001"
                value={transferForm.amount}
                onChange={(e) => setTransferForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="1000"
              />
            </Field>

            <Field label="Актив">
              <input
                value={transferForm.asset}
                onChange={(e) => setTransferForm((p) => ({ ...p, asset: (e.target.value || "").toUpperCase() }))}
                placeholder="USDT"
              />
            </Field>

            <Field
              label="Откуда"
              hint={transferForm.type === "deposit" ? "Для пополнения можно оставить External" : ""}
            >
              <select
                value={transferForm.from_account_id}
                onChange={(e) => setTransferForm((p) => ({ ...p, from_account_id: e.target.value }))}
              >
                <option value="">(External)</option>
                {(accounts || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.provider} — {a.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Куда"
              hint={transferForm.type === "withdraw" ? "Для вывода можно оставить External" : ""}
            >
              <select
                value={transferForm.to_account_id}
                onChange={(e) => setTransferForm((p) => ({ ...p, to_account_id: e.target.value }))}
              >
                <option value="">(External)</option>
                {(accounts || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.provider} — {a.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="crypto-full-span">
              <Field label="Комментарий (необязательно)">
                <input
                  value={transferForm.comment}
                  onChange={(e) => setTransferForm((p) => ({ ...p, comment: e.target.value }))}
                  placeholder="Например: распределение маржи"
                />
              </Field>
            </div>
          </div>
        </Modal>

        <div className="crypto-left-col">
          <div className="card crypto-action-bar">
            <button className="save-btn crypto-grow-btn" onClick={openCreateAccount} type="button">
              <Plus size={18} />
              <span>Добавить счет</span>
            </button>

            <button
              className="secondary-btn crypto-grow-btn"
              onClick={openTransfer}
              disabled={!hasAccounts}
              type="button"
            >
              <History size={18} />
              <span>Операция</span>
            </button>
          </div>

          <div
            className="card-gradient crypto-visual-card"
            onClick={() => (hasAccounts ? openEmptyEditor() : toast.info("Сначала добавь хотя бы один счет"))}
            title={!hasAccounts ? "Добавьте счет, затем откройте схему" : ""}
          >
            <div>
              <div className="crypto-visual-title">Схема потоков</div>
              <div className="crypto-visual-subtitle">Открыть визуальный редактор</div>
            </div>
            <Maximize2 size={22} />
          </div>

          <div className="card crypto-schemes-card">
            <div className="crypto-card-head">
              <FolderOpen size={18} />
              <span>Схемы</span>
            </div>

            <div>
              {schemes.length === 0 ? (
                <div className="crypto-inner-pad">
                  <EmptyState
                    title="Схем пока нет"
                    text="Нарисуй потоки в редакторе и сохрани схему, чтобы быстро возвращаться к структуре."
                    action={
                      <button
                        className="save-btn"
                        onClick={() => (hasAccounts ? openEmptyEditor() : toast.info("Сначала добавь счет"))}
                        type="button"
                      >
                        Открыть редактор
                      </button>
                    }
                  />
                </div>
              ) : (
                schemes.map((s) => (
                  <div key={s.id} className="crypto-scheme-item">
                    <div className="crypto-scheme-main" onClick={() => loadScheme(s)}>
                      <div className="crypto-scheme-name">{s.name}</div>
                      <div className="crypto-scheme-date">
                        {s.created_at ? String(s.created_at).slice(0, 10) : ""}
                      </div>
                    </div>

                    <button className="icon-btn danger" onClick={() => deleteScheme(s.id)} type="button">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card crypto-refresh-card">
            <button className="secondary-btn" onClick={refreshCrypto} type="button">
              Обновить данные
            </button>
            {loading ? <div className="crypto-refresh-note">Загрузка...</div> : null}
          </div>
        </div>

        <div className="crypto-right-col">
          <div className="crypto-accounts-block">
            <h3>Счета</h3>

            {loading ? (
              <div className="crypto-loading-text">Загрузка...</div>
            ) : accounts.length === 0 ? (
              <div className="crypto-top-gap">
                <EmptyState
                  title="Счетов пока нет"
                  text="Создай первый счет. После этого можно добавлять операции и строить схему потоков."
                  action={
                    <button className="save-btn" onClick={openCreateAccount} type="button">
                      <Plus size={16} style={{ verticalAlign: "middle", marginRight: 8 }} />
                      Добавить счет
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="crypto-accounts-grid">
                {Object.keys(groupedAccounts).map((prov) => (
                  <div key={prov} className="card crypto-provider-card">
                    <div className="crypto-provider-head">
                      <span>{prov}</span>
                      <span className="crypto-provider-count">{groupedAccounts[prov].length}</span>
                    </div>

                    <div className="crypto-provider-body">
                      {groupedAccounts[prov].map((acc) => (
                        <div key={acc.id} className="crypto-account-row">
                          <div className="crypto-account-main">
                            <div className="crypto-account-name">{acc.name}</div>
                            <div className="crypto-account-asset">
                              {acc.asset ? (
                                <>
                                  Актив: <b>{acc.asset}</b>
                                </>
                              ) : (
                                <span>Актив: не указан</span>
                              )}
                            </div>
                          </div>

                          <div className="crypto-account-actions">
                            <button className="icon-btn" title="Редактировать" onClick={() => openEditAccount(acc)} type="button">
                              <Pencil size={14} />
                            </button>
                            <button className="icon-btn danger" title="Удалить" onClick={() => deleteAccount(acc.id)} type="button">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card crypto-history-card">
            <div className="crypto-history-head">
              <div className="crypto-history-title">
                <History size={18} color="#10b981" />
                <h3>История операций</h3>
              </div>

              <button
                className="secondary-btn"
                onClick={openTransfer}
                disabled={!hasAccounts}
                type="button"
              >
                <Plus size={16} />
                <span>Добавить</span>
              </button>
            </div>

            <div className="crypto-history-body">
              {loading ? (
                <div className="crypto-loading-text">Загрузка...</div>
              ) : transfers.length === 0 ? (
                <div className="crypto-inner-pad">
                  <EmptyState
                    title="Операций пока нет"
                    text="Добавь первую операцию. Для визуализации потоков открой “Схему потоков”."
                    action={
                      <button
                        className="save-btn"
                        onClick={openTransfer}
                        disabled={!hasAccounts}
                        type="button"
                      >
                        Добавить операцию
                      </button>
                    }
                  />
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Тип</th>
                        <th>Откуда</th>
                        <th>Куда</th>
                        <th style={{ textAlign: "right" }}>Сумма</th>
                        <th style={{ textAlign: "right" }}>Действия</th>
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
                          <tr key={t.id}>
                            <td>{t.date}</td>
                            <td><b>{typeLabel}</b></td>
                            <td><b>{fromAcc}</b></td>
                            <td><b>{toAcc}</b></td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "#2563eb" }}>
                              {fmtAmount(t.amount)} {t.asset}
                              {t.comment ? ` • ${t.comment}` : ""}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button className="icon-btn danger" title="Удалить" onClick={() => deleteTransfer(t.id)} type="button">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function CryptoPage() {
  return (
    <div className="page crypto-page">
      <div className="crypto-page-head">
        <h1>
          <Wallet color="#7c3aed" />
          <span>Крипто счета</span>
        </h1>
      </div>

      <div className="crypto-page-body">
        <CryptoTab />
      </div>
    </div>
  );
}