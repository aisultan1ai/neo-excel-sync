import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Plus, Pencil, Trash2, History, FolderOpen, Maximize2 } from "lucide-react";

import Modal from "../../components/Modal";
import Field from "../../components/Field";
import EmptyState from "../../components/EmptyState";
import useConfirm from "../../components/useConfirm";

import {
  fetchCryptoAccounts, createCryptoAccount, updateCryptoAccount, deleteCryptoAccount,
  fetchTransfers, createTransfer, deleteTransferApi,
  fetchSchemes, createSchemeApi, deleteSchemeApi,
} from "./api";
import { PROVIDERS, TX_TYPES, fmtAmount, edgeLabelFromTx, normalizeTransfer, normalizeEdge } from "./helpers";
import VisualEditorModal from "./VisualEditor";

// ─── ProviderInput ────────────────────────────────────────────────────────────

const ProviderInput = ({ value, onChange, listId = "providers-any", placeholder = "Например: Binance / Ledger / Kaspi" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <input className="text-input" list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    <datalist id={listId}>
      {PROVIDERS.map((p) => <option key={p} value={p} />)}
    </datalist>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {PROVIDERS.map((p) => (
        <button
          key={p} type="button" onClick={() => onChange(p)}
          style={{ fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#334155" }}
          title="Быстро выбрать"
        >
          {p}
        </button>
      ))}
    </div>
    <div style={{ fontSize: 12, color: "#94a3b8" }}>
      Можно выбрать из подсказок или написать свой провайдер вручную.
    </div>
  </div>
);

// ─── CryptoTab ────────────────────────────────────────────────────────────────

const CryptoTab = () => {
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
    type: "transfer", fromId: "", toId: "", amount: "", asset: "USDT", comment: "",
  });

  const refreshCrypto = useCallback(async () => {
    setLoading(true);
    try {
      const [accsRaw, txsRaw, schemesRaw] = await Promise.all([
        fetchCryptoAccounts(),
        fetchTransfers(),
        fetchSchemes().catch(() => []),
      ]);
      setAccounts(Array.isArray(accsRaw) ? accsRaw : []);
      setTransfers(Array.isArray(txsRaw) ? txsRaw.map(normalizeTransfer) : []);
      setSchemes(Array.isArray(schemesRaw) ? schemesRaw : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка загрузки данных");
      setAccounts([]); setTransfers([]); setSchemes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshCrypto(); }, [refreshCrypto]);

  const groupedAccounts = useMemo(() =>
    (accounts || []).reduce((acc, item) => {
      const key = item.provider || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {}),
  [accounts]);

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
    if (!accForm.provider.trim() || !accForm.name.trim())
      return toast.warning("Заполните провайдер и название счета");
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
    const ok = await confirm({ title: "Удалить счет?", subtitle: "Счет будет удален навсегда.", confirmText: "Удалить", danger: true });
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
    setTransferForm({ date: new Date().toISOString().slice(0, 10), type: "transfer", fromId: "", toId: "", amount: "", asset: "USDT", comment: "" });
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
      if (!toAcc) return toast.warning("Для пополнения выберите "Куда"");
    } else if (type === "withdraw") {
      if (!fromAcc) return toast.warning("Для вывода выберите "Откуда"");
    }
    const label = edgeLabelFromTx({ type, amount: amountNum, asset: assetUp, comment });
    try {
      await createTransfer({ date, type, amount: amountNum, asset: assetUp, comment: comment || "", fromId: fromAcc ? fromAcc.id : null, toId: toAcc ? toAcc.id : null, label });
      setOpenTransferModal(false);
      toast.success("Операция записана");
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка при сохранении операции");
    }
  };

  const deleteTransfer = async (id) => {
    const ok = await confirm({ title: "Удалить операцию?", subtitle: "Операция будет удалена навсегда.", confirmText: "Удалить", danger: true });
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
      toast.success("Схема сохранена!");
      setShowVisualEditor(false);
      await refreshCrypto();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Ошибка сохранения схемы");
    }
  };

  const deleteScheme = async (id) => {
    const ok = await confirm({ title: "Удалить схему?", subtitle: "Схема потоков будет удалена навсегда. Счета и операции не удаляются.", confirmText: "Удалить", danger: true });
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
      date: payload.date, type: "transfer", amount: payload.amount,
      asset: payload.asset, comment: payload.comment || "",
      fromId: payload.fromId ?? null, toId: payload.toId ?? null,
      label: payload.label || edgeLabelFromTx(payload),
    });
    await refreshCrypto();
  };

  const openEmptyEditor = () => { setSchemeToLoad(null); setShowVisualEditor(true); };
  const loadScheme = (s) => {
    setSchemeToLoad({
      ...s,
      nodes: Array.isArray(s?.nodes) ? s.nodes : [],
      edges: Array.isArray(s?.edges) ? s.edges.map(normalizeEdge) : [],
    });
    setShowVisualEditor(true);
  };

  const hasAccounts = (accounts || []).length > 0;
  const canSaveAcc = accForm.provider.trim() && accForm.name.trim();
  const canSaveTransfer = transferForm.amount && transferForm.asset.trim() &&
    (transferForm.type !== "transfer" || (transferForm.fromId && transferForm.toId)) &&
    (transferForm.type !== "deposit" || transferForm.toId) &&
    (transferForm.type !== "withdraw" || transferForm.fromId);

  return (
    <>
      <ConfirmDialog />

      <div style={{ display: "flex", gap: 16, height: "100%", overflow: "hidden" }}>
        {showVisualEditor ? (
          <VisualEditorModal
            accounts={accounts} initialData={schemeToLoad}
            onAddTransfer={addTransferFromVisual} onSaveScheme={saveScheme}
            onClose={() => setShowVisualEditor(false)}
          />
        ) : null}

        {/* Account modal */}
        <Modal
          open={openAccModal}
          title={editingAcc ? "Редактировать крипто-счет" : "Новый крипто-счет"}
          subtitle="Счет провайдера (биржа/кошелек). Он станет узлом в схеме."
          onClose={() => setOpenAccModal(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setOpenAccModal(false)}>Отмена</button>
              <button className="btn-primary" onClick={saveAccount} disabled={!canSaveAcc} style={{ opacity: !canSaveAcc ? 0.6 : 1 }}>
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

        {/* Transfer modal */}
        <Modal
          open={openTransferModal}
          title="Добавить операцию"
          subtitle="Запись попадет в историю. Для визуализации — используй схему потоков."
          onClose={() => setOpenTransferModal(false)}
          width={820}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setOpenTransferModal(false)}>Отмена</button>
              <button className="btn-primary" onClick={saveTransfer} disabled={!canSaveTransfer} style={{ opacity: !canSaveTransfer ? 0.6 : 1 }}>
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
                    <button key={t.id} type="button" onClick={() => setTransferForm((p) => ({ ...p, type: t.id }))}
                      style={{ borderRadius: 12, border: `1px solid ${active ? "#3b82f6" : "#e2e8f0"}`, background: active ? "#eff6ff" : "#fff", padding: "10px 10px", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", fontWeight: 600, color: active ? "#2563eb" : "#334155" }}>
                      <Icon size={16} />{t.label}
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
                {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.provider} — {a.name}</option>)}
              </select>
            </Field>
            <Field label="Куда" hint={transferForm.type === "withdraw" ? "Для вывода можно оставить External" : ""}>
              <select className="text-input" value={transferForm.toId} onChange={(e) => setTransferForm((p) => ({ ...p, toId: e.target.value }))}>
                <option value="">(External)</option>
                {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.provider} — {a.name}</option>)}
              </select>
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Комментарий (необязательно)">
                <input className="text-input" value={transferForm.comment} onChange={(e) => setTransferForm((p) => ({ ...p, comment: e.target.value }))} placeholder="Например: распределение маржи" />
              </Field>
            </div>
          </div>
        </Modal>

        {/* LEFT panel */}
        <div style={{ width: 360, display: "flex", flexDirection: "column", gap: 14, flexShrink: 0, overflowY: "auto" }}>
          <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={openCreateAccount} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
              <Plus size={18} /> Добавить счет
            </button>
            <button className="btn-secondary" onClick={openTransfer} disabled={!hasAccounts}
              style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center", opacity: !hasAccounts ? 0.6 : 1 }}
              title={!hasAccounts ? "Сначала добавьте счет" : ""}>
              <History size={18} /> Операция
            </button>
          </div>

          <div
            className="card-gradient"
            onClick={() => hasAccounts ? openEmptyEditor() : toast.info("Сначала добавь хотя бы один счет")}
            style={{ cursor: "pointer", padding: 16, color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: hasAccounts ? 1 : 0.75 }}
            title={!hasAccounts ? "Добавьте счет, затем откройте схему" : ""}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Схема потоков</div>
              <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>Открыть визуальный редактор</div>
            </div>
            <Maximize2 size={22} />
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", background: "#f1f5f9", fontWeight: 700, color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
              <FolderOpen size={18} /> Схемы
            </div>
            <div>
              {schemes.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState
                    title="Схем пока нет"
                    text="Нарисуй потоки в редакторе и сохрани схему, чтобы быстро возвращаться к структуре."
                    action={<button className="btn-primary" onClick={() => hasAccounts ? openEmptyEditor() : toast.info("Сначала добавь счет")}>Открыть редактор</button>}
                  />
                </div>
              ) : schemes.map((s) => (
                <div key={s.id} className="list-item"
                  style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div onClick={() => loadScheme(s)} style={{ cursor: "pointer", flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{s.created_at ? String(s.created_at).slice(0, 10) : ""}</div>
                  </div>
                  <Trash2 size={16} style={{ cursor: "pointer", color: "#cbd5e1" }} onClick={() => deleteScheme(s.id)} />
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <button className="btn-secondary" onClick={refreshCrypto} style={{ width: "100%" }}>Обновить данные</button>
            {loading ? <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>Загрузка...</div> : null}
          </div>
        </div>

        {/* RIGHT panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
          <div style={{ flex: "0 0 auto", maxHeight: "40%", overflowY: "auto" }}>
            <h3 style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>Счета</h3>
            {loading ? (
              <div style={{ marginTop: 12, color: "#64748b" }}>Загрузка...</div>
            ) : accounts.length === 0 ? (
              <div style={{ marginTop: 12 }}>
                <EmptyState
                  title="Счетов пока нет"
                  text="Создай первый счет (биржа/кошелек). После этого можно добавлять операции и строить схему потоков."
                  action={<button className="btn-primary" onClick={openCreateAccount}><Plus size={16} style={{ verticalAlign: "middle", marginRight: 8 }} />Добавить счет</button>}
                />
              </div>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                {Object.keys(groupedAccounts).map((prov) => (
                  <div key={prov} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ background: "#f8fafc", padding: "10px 12px", fontWeight: 700, color: "#475569", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{prov}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{groupedAccounts[prov].length}</span>
                    </div>
                    <div style={{ padding: 10 }}>
                      {groupedAccounts[prov].map((acc) => (
                        <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #f1f5f9", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.name}</div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                              {acc.asset ? <>Актив: <b style={{ fontWeight: 600 }}>{acc.asset}</b></> : <span style={{ color: "#94a3b8" }}>Актив: не указан</span>}
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
                <h3 style={{ margin: 0, fontWeight: 700 }}>История операций</h3>
              </div>
              <button className="btn-secondary" onClick={openTransfer} disabled={!hasAccounts}
                style={{ display: "flex", alignItems: "center", gap: 8, opacity: !hasAccounts ? 0.6 : 1 }}>
                <Plus size={16} /> Добавить
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: 12, color: "#64748b" }}>Загрузка...</div>
              ) : transfers.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState
                    title="Операций пока нет"
                    text='Добавь первую операцию. Для визуализации потоков открой "Схему потоков".'
                    action={<button className="btn-primary" onClick={openTransfer} disabled={!hasAccounts} style={{ opacity: !hasAccounts ? 0.6 : 1 }}>Добавить операцию</button>}
                  />
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    <tr>
                      {["Дата", "Тип", "Откуда", "Куда", "Сумма", "Действия"].map((h, i) => (
                        <th key={h} style={{ textAlign: i >= 4 ? "right" : "left", padding: "12px 16px", color: "#64748b", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t0) => {
                      const t = normalizeTransfer(t0);
                      const typeLabel = TX_TYPES.find((x) => x.id === t.type)?.label || "Операция";
                      const fromAcc = t.from || (t.fromId ? (() => { const a = accounts.find((x) => String(x.id) === String(t.fromId)); return a ? `${a.provider} - ${a.name}` : ""; })() : "External");
                      const toAcc = t.to || (t.toId ? (() => { const a = accounts.find((x) => String(x.id) === String(t.toId)); return a ? `${a.provider} - ${a.name}` : ""; })() : "External");
                      return (
                        <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 16px", color: "#94a3b8", whiteSpace: "nowrap" }}>{t.date}</td>
                          <td style={{ padding: "10px 16px", fontWeight: 600, color: "#334155" }}>{typeLabel}</td>
                          <td style={{ padding: "10px 16px", fontWeight: 600, color: "#0f172a" }}>{fromAcc}</td>
                          <td style={{ padding: "10px 16px", fontWeight: 600, color: "#0f172a" }}>{toAcc}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#3b82f6" }}>
                            {fmtAmount(t.amount)} {t.asset}{t.comment ? ` • ${t.comment}` : ""}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right" }}>
                            <button className="icon-pill danger" title="Удалить" onClick={() => deleteTransfer(t.id)}><Trash2 size={14} /></button>
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
    </>
  );
};

export default CryptoTab;
