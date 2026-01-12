import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'react-toastify';
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
  Calendar,
  Users,
  ChevronDown,
  ChevronRight,
  Search,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shuffle,
} from 'lucide-react';

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
} from 'reactflow';
import 'reactflow/dist/style.css';

// ==========================================
// 0) HELPERS + UI PRIMITIVES
// ==========================================
const cx = (...arr) => arr.filter(Boolean).join(' ');
const PROVIDERS = ['Binance', 'ByBit', 'OKX', 'Kraken', 'Ledger', 'Metamask'];
const TX_TYPES = [
  { id: 'transfer', label: 'Перевод', icon: Shuffle },
  { id: 'deposit', label: 'Пополнение', icon: ArrowDownToLine },
  { id: 'withdraw', label: 'Вывод', icon: ArrowUpFromLine },
];

const fmtAmount = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });
};

const edgeLabelFromTx = ({ type, amount, asset, comment }) => {
  const t = TX_TYPES.find((x) => x.id === type)?.label || 'Операция';
  const a = `${fmtAmount(amount)}${asset ? ` ${asset}` : ''}`.trim();
  const c = comment?.trim() ? ` • ${comment.trim()}` : '';
  return `${t}: ${a}${c}`.trim();
};

const Modal = ({ open, title, subtitle, children, onClose, footer, width = 860 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target.classList.contains('modal-overlay')) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 2000,
      }}
    >
      <div
        className="modal-card"
        style={{
          width: `min(${width}px, 100%)`,
          background: 'white',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            background: '#f8fafc',
          }}
        >
          <div>
            <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 16 }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            title="Закрыть"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: 'white',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>{children}</div>

        {footer ? (
          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              flexWrap: 'wrap',
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
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>{label}</div>
      {hint ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</div> : null}
    </div>
    {children}
  </div>
);

// ==========================================
// 1) REACT FLOW NODE
// ==========================================
const AccountNode = ({ data }) => {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        background: 'white',
        border: '1px solid #e2e8f0',
        boxShadow: '0 8px 18px rgba(0,0,0,0.06)',
        minWidth: 190,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#7c3aed', width: 10, height: 10 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase' }}>{data.provider}</div>
          <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.name}
          </div>
        </div>
        {data.badge ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              color: '#0ea5e9',
              background: '#e0f2fe',
              padding: '4px 8px',
              borderRadius: 999,
              border: '1px solid #bae6fd',
              whiteSpace: 'nowrap',
            }}
          >
            {data.badge}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#7c3aed', width: 10, height: 10 }} />
    </div>
  );
};
const nodeTypes = { accountNode: AccountNode };

// ==========================================
// 2) MODAL: CREATE EDGE / TRANSFER (instead of prompt)
// ==========================================
const EdgeTxModal = ({ open, onClose, onSubmit, fromTitle, toTitle }) => {
  const [form, setForm] = useState({
    type: 'transfer',
    amount: '',
    asset: 'USDT',
    comment: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({ type: 'transfer', amount: '', asset: 'USDT', comment: '' });
  }, [open]);

  const submit = () => {
    const amount = Number(form.amount);
    if (!form.amount) return toast.warning('Введите сумму');
    if (Number.isNaN(amount)) return toast.warning('Сумма должна быть числом');
    const asset = (form.asset || '').trim().toUpperCase();
    if (!asset) return toast.warning('Введите актив (например USDT)');
    onSubmit?.({ type: form.type, amount, asset, comment: form.comment || '' });
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
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
        <Field label="Тип операции">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {TX_TYPES.map((t) => {
              const Icon = t.icon;
              const active = form.type === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setForm((p) => ({ ...p, type: t.id }))}
                  type="button"
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
                    background: active ? '#eff6ff' : '#fff',
                    padding: '10px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    color: active ? '#2563eb' : '#334155',
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
            onChange={(e) => setForm((p) => ({ ...p, asset: e.target.value }))}
            placeholder="USDT"
          />
        </Field>

        <Field label="Сумма" hint="Число">
          <input
            className="text-input"
            type="number"
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

        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          Совет: “Пополнение/Вывод” можно рисовать как стрелку тоже — это удобно, если хочешь хранить историю визуально.
          Если нужно строго “из/в внешний мир” — потом добавим отдельные “External” узлы.
        </div>
      </div>
    </Modal>
  );
};

// ==========================================
// 3) VISUAL EDITOR (prompt -> modal)
// ==========================================
const VisualEditorModal = ({ accounts, initialData, onClose, onAddTransfer, onSaveScheme }) => {
  const initialNodes =
    initialData?.nodes ||
    accounts.map((acc, index) => ({
      id: acc.id.toString(),
      type: 'accountNode',
      position: { x: 120 + index * 240, y: 130 + (index % 2 ? 90 : 0) },
      data: { provider: acc.provider, name: acc.name, badge: acc.asset || '' },
    }));

  const initialEdges = initialData?.edges || [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // state for modal edge creation
  const [pendingConnect, setPendingConnect] = useState(null); // { params, fromNode, toNode }
  const [openEdgeModal, setOpenEdgeModal] = useState(false);

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

  const confirmEdge = (tx) => {
    if (!pendingConnect) return;

    const { params, fromNode, toNode } = pendingConnect;

    const label = edgeLabelFromTx(tx);

    const newEdge = {
      ...params,
      animated: true,
      label,
      data: { tx }, // сохраняем структуру операции прямо в ребро
      style: { stroke: '#7c3aed', strokeWidth: 2 },
      labelStyle: { fill: '#7c3aed', fontWeight: 900 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
    };

    setEdges((eds) => addEdge(newEdge, eds));

    if (onAddTransfer) {
      onAddTransfer({
        id: Date.now(),
        date: new Date().toLocaleString(),
        type: tx.type,
        asset: tx.asset,
        amount: tx.amount,
        comment: tx.comment,
        from: `${fromNode.data.provider} - ${fromNode.data.name}`,
        to: `${toNode.data.provider} - ${toNode.data.name}`,
        label,
      });
    }

    setOpenEdgeModal(false);
    setPendingConnect(null);
    toast.success('Стрелка добавлена');
  };

  const handleSaveClick = () => {
    const name = window.prompt('Название схемы:');
    if (name) onSaveScheme(name, nodes, edges);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 2100, display: 'flex', flexDirection: 'column' }}>
      <EdgeTxModal
        open={openEdgeModal}
        onClose={() => {
          setOpenEdgeModal(false);
          setPendingConnect(null);
        }}
        onSubmit={confirmEdge}
        fromTitle={pendingConnect ? `${pendingConnect.fromNode.data.provider} — ${pendingConnect.fromNode.data.name}` : ''}
        toTitle={pendingConnect ? `${pendingConnect.toNode.data.provider} — ${pendingConnect.toNode.data.name}` : ''}
      />

      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc',
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>Визуальный редактор потоков</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>Соединяй счета стрелками — ввод суммы будет в модальном окне.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSaveClick} className="btn-primary" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Save size={16} /> Сохранить схему
          </button>
          <button
            onClick={onClose}
            style={{
              border: '1px solid #e2e8f0',
              background: 'white',
              borderRadius: 10,
              width: 40,
              height: 40,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, background: '#f8fafc' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <MiniMap style={{ height: 120 }} />
          <Background color="#cbd5e1" variant="dots" gap={20} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
};

// ==========================================
// 4) TAB 1: CLIENT ACCOUNTS (оставил как было, укорочено)
// ==========================================
const ClientAccountsTab = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 7));
  const [clients, setClients] = useState([]);
  const [expandedClients, setExpandedClients] = useState({});
  const [search, setSearch] = useState('');

  const [openClientModal, setOpenClientModal] = useState(false);
  const [openSubModal, setOpenSubModal] = useState(false);
  const [subModalClient, setSubModalClient] = useState(null);

  const [clientForm, setClientForm] = useState({ name: '' });
  const [subForm, setSubForm] = useState({ exchange: 'Binance', currency: 'USDT', balance: '', date: '' });

  useEffect(() => {
    setClients([
      { id: 1, name: 'Ivanov Ivan', subAccounts: [{ id: 101, exchange: 'Binance', currency: 'USDT', balance: 15400.5, date: '2023-12' }] },
      { id: 2, name: 'Petrov Petr', subAccounts: [{ id: 201, exchange: 'OKX', currency: 'ETH', balance: 12.5, date: '2023-12' }] },
    ]);
  }, []);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byDate = selectedDate;
    return clients
      .map((c) => ({ ...c, subAccounts: c.subAccounts.filter((s) => String(s.date || '').startsWith(byDate)) }))
      .filter((c) => (!q ? true : c.name.toLowerCase().includes(q)));
  }, [clients, search, selectedDate]);

  const toggleClient = (id) => setExpandedClients((prev) => ({ ...prev, [id]: !prev[id] }));

  const saveClient = () => {
    const name = clientForm.name.trim();
    if (!name) return toast.warning('Введите имя клиента');
    setClients((prev) => [{ id: Date.now(), name, subAccounts: [] }, ...prev]);
    setOpenClientModal(false);
    toast.success('Клиент добавлен');
  };

  const openAddSub = (client) => {
    setSubModalClient(client);
    setSubForm({ exchange: 'Binance', currency: 'USDT', balance: '', date: selectedDate });
    setOpenSubModal(true);
  };

  const saveSubAccount = () => {
    if (!subModalClient) return;
    const exchange = subForm.exchange.trim();
    const currency = subForm.currency.trim().toUpperCase();
    const balanceNum = Number(subForm.balance);
    const date = subForm.date || selectedDate;

    if (!exchange || !currency || !subForm.balance) return toast.warning('Заполните все поля счета');
    if (Number.isNaN(balanceNum)) return toast.warning('Баланс должен быть числом');

    setClients((prev) =>
      prev.map((c) => (c.id !== subModalClient.id ? c : { ...c, subAccounts: [...c.subAccounts, { id: Date.now(), exchange, currency, balance: balanceNum, date }] }))
    );

    setExpandedClients((prev) => ({ ...prev, [subModalClient.id]: true }));
    setOpenSubModal(false);
    toast.success('Счет добавлен');
  };

  const deleteSubAccount = (clientId, subId) => {
    if (!window.confirm('Удалить этот счет?')) return;
    setClients((prev) => prev.map((c) => (c.id !== clientId ? c : { ...c, subAccounts: c.subAccounts.filter((s) => s.id !== subId) })));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      <Modal
        open={openClientModal}
        title="Новый клиент"
        subtitle="Создайте клиента, затем добавьте ему субсчета."
        onClose={() => setOpenClientModal(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpenClientModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={saveClient}>
              Создать
            </button>
          </>
        }
      >
        <Field label="ФИО / Название клиента">
          <input className="text-input" value={clientForm.name} onChange={(e) => setClientForm({ name: e.target.value })} placeholder="Ivanov Ivan" autoFocus />
        </Field>
      </Modal>

      <Modal
        open={openSubModal}
        title="Добавить счет клиента"
        subtitle={subModalClient ? `Клиент: ${subModalClient.name}` : ''}
        onClose={() => setOpenSubModal(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpenSubModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={saveSubAccount}>
              Добавить
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Биржа / Провайдер">
            <input className="text-input" list="providers-client" value={subForm.exchange} onChange={(e) => setSubForm((p) => ({ ...p, exchange: e.target.value }))} />
            <datalist id="providers-client">{PROVIDERS.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Валюта">
            <input className="text-input" value={subForm.currency} onChange={(e) => setSubForm((p) => ({ ...p, currency: e.target.value }))} />
          </Field>
          <Field label="Баланс">
            <input className="text-input" type="number" value={subForm.balance} onChange={(e) => setSubForm((p) => ({ ...p, balance: e.target.value }))} />
          </Field>
          <Field label="Период (месяц)">
            <input className="text-input" type="month" value={subForm.date} onChange={(e) => setSubForm((p) => ({ ...p, date: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={18} color="#64748b" />
          <div style={{ fontWeight: 900, color: '#475569' }}>Период</div>
          <input type="month" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="text-input" style={{ width: 160 }} />
        </div>

        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input className="text-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск клиента..." style={{ paddingLeft: 36, width: '100%' }} />
        </div>

        <button className="btn-primary" onClick={() => { setClientForm({ name: '' }); setOpenClientModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={18} /> Новый клиент
        </button>
      </div>

      <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 900, color: '#475569' }}>
          Клиенты
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredClients.map((client) => (
            <div key={client.id}>
              <div
                onClick={() => toggleClient(client.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: expandedClients[client.id] ? '#eff6ff' : 'white',
                }}
              >
                {expandedClients[client.id] ? <ChevronDown size={18} color="#3b82f6" /> : <ChevronRight size={18} color="#94a3b8" />}
                <div style={{ fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={16} color="#3b82f6" /> {client.name}
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openAddSub(client);
                    }}
                    style={{
                      fontSize: 12,
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: '1px solid #bfdbfe',
                      background: '#dbeafe',
                      color: '#2563eb',
                      cursor: 'pointer',
                      fontWeight: 900,
                    }}
                  >
                    + Счет
                  </button>
                </div>
              </div>

              {expandedClients[client.id] &&
                client.subAccounts.map((sub) => (
                  <div key={sub.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: '#fcfcfc', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ color: '#64748b' }}>
                      #{sub.id} • <b style={{ color: '#334155' }}>{sub.exchange}</b> • <b style={{ color: '#0ea5e9' }}>{sub.currency}</b>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontWeight: 900, color: '#10b981' }}>{fmtAmount(sub.balance)}</div>
                      <div style={{ color: '#94a3b8', fontSize: 13 }}>{sub.date}</div>
                      <Trash2 size={14} style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => deleteSubAccount(client.id, sub.id)} />
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 5) TAB 2: CRYPTO (обновлено: операции структурированные + flow editor modal уже новый)
// ==========================================
const CryptoTab = () => {
  const [showVisualEditor, setShowVisualEditor] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [savedSchemes, setSavedSchemes] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [schemeToLoad, setSchemeToLoad] = useState(null);

  // MODALS
  const [openAccModal, setOpenAccModal] = useState(false);
  const [openTransferModal, setOpenTransferModal] = useState(false);

  const [editingAcc, setEditingAcc] = useState(null);
  const [accForm, setAccForm] = useState({ provider: 'Binance', name: '', asset: '' });

  const [transferForm, setTransferForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'transfer',
    fromId: '',
    toId: '',
    amount: '',
    asset: 'USDT',
    comment: '',
  });

  useEffect(() => {
    setAccounts([
      { id: 1, provider: 'Binance', name: 'Spot Wallet', asset: 'USDT' },
      { id: 2, provider: 'Ledger', name: 'Cold Storage', asset: 'BTC' },
      { id: 3, provider: 'ByBit', name: 'Futures', asset: 'USDT' },
    ]);

    setTransfers([
      {
        id: 101,
        date: '2025-12-23',
        type: 'transfer',
        amount: 0.5,
        asset: 'BTC',
        comment: '',
        from: 'Binance - Spot Wallet',
        to: 'Ledger - Cold Storage',
        label: edgeLabelFromTx({ type: 'transfer', amount: 0.5, asset: 'BTC', comment: '' }),
      },
    ]);
  }, []);

  const groupedAccounts = useMemo(() => {
    return accounts.reduce((acc, item) => {
      if (!acc[item.provider]) acc[item.provider] = [];
      acc[item.provider].push(item);
      return acc;
    }, {});
  }, [accounts]);

  const openCreateAccount = () => {
    setEditingAcc(null);
    setAccForm({ provider: 'Binance', name: '', asset: '' });
    setOpenAccModal(true);
  };

  const openEditAccount = (acc) => {
    setEditingAcc(acc);
    setAccForm({ provider: acc.provider, name: acc.name, asset: acc.asset || '' });
    setOpenAccModal(true);
  };

  const saveAccount = () => {
    if (!accForm.provider.trim() || !accForm.name.trim()) return toast.warning('Заполните провайдер и название счета');

    if (editingAcc) {
      setAccounts((prev) => prev.map((a) => (a.id === editingAcc.id ? { ...a, ...accForm } : a)));
      toast.info('Счет обновлен');
    } else {
      setAccounts((prev) => [{ id: Date.now(), ...accForm }, ...prev]);
      toast.success('Счет добавлен');
    }
    setOpenAccModal(false);
  };

  const deleteAccount = (id) => {
    if (!window.confirm('Удалить счет?')) return;
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const openTransfer = () => {
    setTransferForm({
      date: new Date().toISOString().slice(0, 10),
      type: 'transfer',
      fromId: '',
      toId: '',
      amount: '',
      asset: 'USDT',
      comment: '',
    });
    setOpenTransferModal(true);
  };

  const saveTransfer = () => {
    const { fromId, toId, amount, asset, date, comment, type } = transferForm;

    if (!amount) return toast.warning('Введите сумму');
    const amountNum = Number(amount);
    if (Number.isNaN(amountNum)) return toast.warning('Сумма должна быть числом');

    const assetUp = (asset || '').trim().toUpperCase();
    if (!assetUp) return toast.warning('Введите актив');

    const fromAcc = fromId ? accounts.find((a) => String(a.id) === String(fromId)) : null;
    const toAcc = toId ? accounts.find((a) => String(a.id) === String(toId)) : null;

    // правила:
    // deposit: можно без from (внешний источник)
    // withdraw: можно без to (внешний получатель)
    // transfer: оба обязательны
    if (type === 'transfer') {
      if (!fromAcc || !toAcc) return toast.warning('Выберите Откуда и Куда');
      if (fromAcc.id === toAcc.id) return toast.warning('Нельзя переводить на тот же счет');
    } else if (type === 'deposit') {
      if (!toAcc) return toast.warning('Для пополнения выберите “Куда”');
    } else if (type === 'withdraw') {
      if (!fromAcc) return toast.warning('Для вывода выберите “Откуда”');
    }

    const label = edgeLabelFromTx({ type, amount: amountNum, asset: assetUp, comment });

    const fromLabel = fromAcc ? `${fromAcc.provider} - ${fromAcc.name}` : 'External - Deposit';
    const toLabel = toAcc ? `${toAcc.provider} - ${toAcc.name}` : 'External - Withdraw';

    setTransfers((prev) => [
      {
        id: Date.now(),
        date,
        type,
        amount: amountNum,
        asset: assetUp,
        comment,
        from: fromLabel,
        to: toLabel,
        label,
      },
      ...prev,
    ]);

    setOpenTransferModal(false);
    toast.success('Операция записана');
  };

  const saveScheme = (name, nodes, edges) => {
    const newScheme = { name, date: new Date().toLocaleDateString(), nodes, edges, id: Date.now() };
    setSavedSchemes((prev) => [newScheme, ...prev]);
    toast.success('Схема сохранена!');
    setShowVisualEditor(false);
  };

  const deleteScheme = (id) => {
    if (!window.confirm('Удалить схему?')) return;
    setSavedSchemes((prev) => prev.filter((s) => s.id !== id));
  };

  const addTransferFromVisual = (t) => {
    // t уже приходит структурой из визуального редактора
    setTransfers((prev) => [
      {
        id: Date.now(),
        date: t.date,
        type: t.type,
        amount: t.amount,
        asset: t.asset,
        comment: t.comment,
        from: t.from,
        to: t.to,
        label: t.label || edgeLabelFromTx(t),
      },
      ...prev,
    ]);
  };

  const openEmptyEditor = () => {
    setSchemeToLoad(null);
    setShowVisualEditor(true);
  };
  const loadScheme = (s) => {
    setSchemeToLoad(s);
    setShowVisualEditor(true);
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>
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
        title={editingAcc ? 'Редактировать крипто-счет' : 'Новый крипто-счет'}
        subtitle="Счет провайдера (биржа/кошелек). Это будет узел в схеме."
        onClose={() => setOpenAccModal(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpenAccModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={saveAccount}>
              {editingAcc ? 'Сохранить' : 'Создать'}
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Провайдер">
            <input
              className="text-input"
              list="providers-crypto"
              value={accForm.provider}
              onChange={(e) => setAccForm((p) => ({ ...p, provider: e.target.value }))}
              placeholder="Binance"
              autoFocus
            />
            <datalist id="providers-crypto">{PROVIDERS.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>

          <Field label="Актив (необязательно)" hint="USDT / BTC / ETH...">
            <input className="text-input" value={accForm.asset} onChange={(e) => setAccForm((p) => ({ ...p, asset: e.target.value }))} placeholder="USDT" />
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Название счета" hint="Spot / Futures / Cold Storage...">
              <input className="text-input" value={accForm.name} onChange={(e) => setAccForm((p) => ({ ...p, name: e.target.value }))} placeholder="Spot Wallet" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* MODAL: transfer */}
      <Modal
        open={openTransferModal}
        title="Записать операцию"
        subtitle="Эта запись попадет в историю. Для визуализации используйте редактор потоков."
        onClose={() => setOpenTransferModal(false)}
        width={820}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpenTransferModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={saveTransfer}>
              Записать
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Дата">
            <input type="date" className="text-input" value={transferForm.date} onChange={(e) => setTransferForm((p) => ({ ...p, date: e.target.value }))} />
          </Field>

          <Field label="Тип операции">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
                      border: `1px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
                      background: active ? '#eff6ff' : '#fff',
                      padding: '10px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      color: active ? '#2563eb' : '#334155',
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
            <input className="text-input" value={transferForm.amount} onChange={(e) => setTransferForm((p) => ({ ...p, amount: e.target.value }))} placeholder="1000" />
          </Field>

          <Field label="Актив">
            <input className="text-input" value={transferForm.asset} onChange={(e) => setTransferForm((p) => ({ ...p, asset: e.target.value }))} placeholder="USDT" />
          </Field>

          <Field label="Откуда" hint={transferForm.type === 'deposit' ? 'Для пополнения можно оставить пустым' : ''}>
            <select className="text-input" value={transferForm.fromId} onChange={(e) => setTransferForm((p) => ({ ...p, fromId: e.target.value }))}>
              <option value="">(External)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.provider} — {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Куда" hint={transferForm.type === 'withdraw' ? 'Для вывода можно оставить пустым' : ''}>
            <select className="text-input" value={transferForm.toId} onChange={(e) => setTransferForm((p) => ({ ...p, toId: e.target.value }))}>
              <option value="">(External)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.provider} — {a.name}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Комментарий (необязательно)">
              <input className="text-input" value={transferForm.comment} onChange={(e) => setTransferForm((p) => ({ ...p, comment: e.target.value }))} placeholder="Например: распределение маржи" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* LEFT */}
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0, overflowY: 'auto' }}>
        <div className="card" style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={openCreateAccount} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
            <Plus size={18} /> Новый счет
          </button>
          <button className="btn-secondary" onClick={openTransfer} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
            <History size={18} /> Операция
          </button>
        </div>

        <div className="card-gradient" onClick={openEmptyEditor} style={{ cursor: 'pointer', padding: 16, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Схема потоков</div>
            <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>Открыть визуальный редактор</div>
          </div>
          <Maximize2 size={22} />
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0', background: '#f1f5f9', fontWeight: 900, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpen size={18} /> Схемы
          </div>
          <div>
            {savedSchemes.length === 0 ? (
              <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8' }}>Нет сохраненных схем</div>
            ) : (
              savedSchemes.map((s) => (
                <div key={s.id} className="list-item" style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div onClick={() => loadScheme(s)} style={{ cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.date}</div>
                  </div>
                  <Trash2 size={16} style={{ cursor: 'pointer', color: '#cbd5e1' }} onClick={() => deleteScheme(s.id)} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
        <div style={{ flex: '0 0 auto', maxHeight: '40%', overflowY: 'auto' }}>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Счета</h3>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {Object.keys(groupedAccounts).map((prov) => (
              <div key={prov} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ background: '#f8fafc', padding: '10px 12px', fontWeight: 900, color: '#475569', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{prov}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 900 }}>{groupedAccounts[prov].length}</span>
                </div>
                <div style={{ padding: 10 }}>
                  {groupedAccounts[prov].map((acc) => (
                    <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #f1f5f9', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.name}</div>
                        {acc.asset ? <div style={{ fontSize: 12, color: '#64748b' }}>Актив: <b>{acc.asset}</b></div> : null}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="icon-pill" title="Редактировать" onClick={() => openEditAccount(acc)}>
                          <Pencil size={14} />
                        </button>
                        <button className="icon-pill danger" title="Удалить" onClick={() => deleteAccount(acc.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: '4px solid #10b981' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <History size={18} color="#10b981" />
              <h3 style={{ margin: 0 }}>История операций</h3>
            </div>
            <button className="btn-secondary" onClick={openTransfer} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={16} /> Добавить
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b' }}>Дата</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b' }}>Тип</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b' }}>Откуда</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b' }}>Куда</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', color: '#64748b' }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                      Операций пока нет.
                    </td>
                  </tr>
                ) : null}

                {transfers.map((t) => {
                  const typeLabel = TX_TYPES.find((x) => x.id === t.type)?.label || 'Операция';
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 900, color: '#334155' }}>{typeLabel}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 900 }}>{t.from}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 900 }}>{t.to}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 900, color: '#3b82f6' }}>
                        {fmtAmount(t.amount)} {t.asset}{t.comment ? ` • ${t.comment}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 6) MAIN PAGE
// ==========================================
const AccountsPage = () => {
  const [activeTab, setActiveTab] = useState('clients'); // 'clients' | 'crypto'

  return (
    <div style={{ padding: 18, height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <Wallet color="#3b82f6" /> Управление счетами
        </h1>

        <div style={{ background: 'white', padding: 4, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', gap: 5 }}>
          <button
            onClick={() => setActiveTab('clients')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 13,
              background: activeTab === 'clients' ? '#eff6ff' : 'transparent',
              color: activeTab === 'clients' ? '#3b82f6' : '#64748b',
            }}
          >
            Счета клиентов
          </button>
          <button
            onClick={() => setActiveTab('crypto')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 13,
              background: activeTab === 'crypto' ? '#f5f3ff' : 'transparent',
              color: activeTab === 'crypto' ? '#7c3aed' : '#64748b',
            }}
          >
            Крипто счета
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>{activeTab === 'clients' ? <ClientAccountsTab /> : <CryptoTab />}</div>

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
