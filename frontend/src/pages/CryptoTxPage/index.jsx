import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  ArrowDownLeft, ArrowUpRight, Copy, Download, FolderCog, Loader2, Pencil, Plus, Search, Trash2, Upload,
} from "lucide-react";
import Modal from "../../components/Modal";
import useConfirm from "../../components/useConfirm";
import { deleteTx, exportTx, getCounterparties, importTx, listSections, listTx } from "./api";
import { DIR_LABEL, PRESETS, S, T, downloadBlob, errText, fmtAmount, fmtDT, shortHash, whoLabel } from "./helpers";
import TxModal from "./TxModal";
import SectionsModal from "./SectionsModal";


const DirPill = ({ section, withName }) => {
  const isIn = section?.direction !== "out";
  return (
    <span title={section?.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: isIn ? "#dcfce7" : "#fee2e2", color: isIn ? T.green : T.red, borderRadius: 100, padding: "2px 9px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
      {isIn ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
      {withName ? (section?.name || "Раздел удалён") : DIR_LABEL[section?.direction] || "—"}
    </span>
  );
};

const sumText = (byAsset) => {
  const e = Object.entries(byAsset || {});
  if (!e.length) return "—";
  return e.map(([a, v]) => `${fmtAmount(Math.round(v * 100) / 100)}${a !== "—" ? ` ${a}` : ""}`).join(" · ");
};

function TxTable({ items, secById, showSection, whoTitle, onEdit, onDelete }) {
  const copy = (h) => navigator.clipboard?.writeText(h).then(() => toast.info("Хэш скопирован"), () => {});
  if (!items.length) return <div style={S.empty}><span style={{ color: T.faint, fontSize: 13 }}>Нет транзакций</span></div>;
  return (
    <div style={{ maxHeight: 620, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={S.th}>Дата</th>
            {showSection && <th style={S.th}>Раздел</th>}
            <th style={S.th}>{whoTitle || "Откуда / Куда"}</th>
            <th style={{ ...S.th, textAlign: "right" }}>Сумма</th>
            <th style={S.th}>Актив</th>
            <th style={S.th}>Хэш транзакции</th>
            <th style={S.th}>Комментарий</th>
            <th style={S.th}>Добавил</th>
            <th style={S.th} />
          </tr>
        </thead>
        <tbody>
          {items.map((t) => {
            const sec = secById[t.section_id];
            const out = sec?.direction === "out";
            return (
              <tr key={t.id}>
                <td style={{ ...S.td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDT(t.tx_time)}</td>
                {showSection && <td style={S.td}><DirPill section={sec} withName /></td>}
                <td style={S.td}>{t.counterparty || "—"}</td>
                <td style={{ ...S.td, ...S.num, fontWeight: 600, color: out ? T.red : T.green }}>{out ? "−" : "+"}{fmtAmount(t.amount)}</td>
                <td style={{ ...S.td, ...T.small }}>{t.asset || "—"}</td>
                <td style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }} title={t.tx_hash || ""}>
                  {shortHash(t.tx_hash)}
                  {t.tx_hash && <button style={{ ...S.iconBtn, marginLeft: 4 }} title="Скопировать хэш" onClick={() => copy(t.tx_hash)}><Copy size={12} /></button>}
                </td>
                <td style={{ ...S.td, ...T.small, maxWidth: 220 }}>{t.comment || ""}</td>
                <td style={{ ...S.td, ...T.small, whiteSpace: "nowrap" }} title={t.source === "import" ? "Импорт из Excel" : "Добавлено вручную"}>
                  {t.created_by || "—"}{t.source === "import" ? " · импорт" : ""}
                </td>
                <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                  <button style={S.iconBtn} title="Изменить" onClick={() => onEdit(t)}><Pencil size={14} /></button>
                  <button style={{ ...S.iconBtn, color: T.red }} title="Удалить" onClick={() => onDelete(t)}><Trash2 size={14} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CryptoTxPage() {
  const [sections, setSections] = useState([]);
  const [filters, setFilters]   = useState({ from: "", to: "", section_id: "", q: "" });
  const [query, setQuery]       = useState("");
  const [data, setData]         = useState({ items: [], totals: {} });
  const [loading, setLoading]   = useState(false);
  const [view, setView]         = useState("dates");    // dates | sections
  const [modal, setModal]       = useState({ open: false, tx: null });
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [cps, setCps]           = useState({});
  const [busy, setBusy]         = useState("");         // import | export
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const loadSections = useCallback(async () => {
    try { const { data: d } = await listSections(); setSections(d || []); }
    catch (err) { toast.error(errText(err, "Ошибка загрузки разделов")); }
  }, []);

  const load = useCallback(async () => {
    if (filters.from && filters.to && filters.from > filters.to) { toast.warn("Дата «с» больше даты «по»"); return; }
    setLoading(true);
    try {
      const { data: d } = await listTx(filters);
      setData(d);
    } catch (err) { toast.error(errText(err, "Ошибка загрузки")); }
    finally { setLoading(false); }
  }, [filters]);

  const loadCps = useCallback(() => getCounterparties().then(({ data: d }) => setCps(d)).catch(() => {}), []);

  useEffect(() => { loadSections(); }, [loadSections]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCps(); }, [loadCps]);

  // поиск — с небольшой задержкой
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 350);
    return () => clearTimeout(t);
  }, [query]);

  const refresh = () => { load(); loadCps(); loadSections(); };

  const secById = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s])), [sections]);
  const tot = data.totals || {};
  // плитки и блоки: активные разделы + архивные, если в выборке есть их транзакции
  const visibleSections = sections.filter((s) => !s.archived || tot[s.id]?.count);
  const activeSection = filters.section_id ? secById[Number(filters.section_id)] : null;

  const bySection = useMemo(() => {
    const out = {};
    data.items.forEach((t) => { (out[t.section_id] = out[t.section_id] || []).push(t); });
    return out;
  }, [data.items]);

  const handleDelete = async (t) => {
    const ok = await confirm({
      title: "Удалить транзакцию?",
      subtitle: `${fmtDT(t.tx_time)} · ${secById[t.section_id]?.name || ""} · ${t.counterparty || ""} · ${fmtAmount(t.amount)}`,
      confirmText: "Удалить", danger: true,
    });
    if (!ok) return;
    try { await deleteTx(t.id); toast.success("Удалено"); refresh(); }
    catch (err) { toast.error(errText(err, "Ошибка удаления")); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("import");
    try {
      const { data: r } = await importTx(file);
      setImportResult({ ...r, fileName: file.name });
      refresh();
    } catch (err) { toast.error(errText(err, "Ошибка импорта"), { autoClose: 10000 }); }
    finally { setBusy(""); }
  };

  const handleExport = async () => {
    setBusy("export");
    try {
      const { data: blob } = await exportTx(filters);
      downloadBlob(blob, `Крипто_транзакции_${filters.from || "всё"}_${filters.to || "сегодня"}.xlsx`);
    } catch { toast.error("Ошибка выгрузки"); }
    finally { setBusy(""); }
  };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>Крипто-транзакции</h1>
          <p style={{ margin: "3px 0 0", ...T.small }}>История пополнений и выводов по разделам</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setModal({ open: true, tx: null })}><Plus size={14} style={{ marginRight: 6 }} />Добавить</button>
          <button style={S.ghost} onClick={() => setSectionsOpen(true)} title="Добавить, переименовать, скрыть или удалить разделы">
            <FolderCog size={14} /> Разделы
          </button>
          <button style={S.ghost} onClick={() => fileRef.current?.click()} disabled={!!busy} title="Загрузить Excel: блоки с заголовками разделов">
            {busy === "import" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />} Импорт из Excel
          </button>
          <button style={S.ghost} onClick={handleExport} disabled={!!busy} title="Скачать с текущими фильтрами">
            {busy === "export" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />} Скачать Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }} onChange={handleImport} />
        </div>
      </div>

      {/* Фильтры */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">С</label>
            <input className="text-input" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} style={{ width: 150 }} />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">По</label>
            <input className="text-input" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} style={{ width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map(([label, fn]) => (
              <button key={label} style={{ ...S.ghost, padding: "6px 10px", fontSize: 12 }} onClick={() => setFilters((f) => ({ ...f, ...fn() }))}>{label}</button>
            ))}
          </div>
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <Search size={14} color={T.faint} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input className="text-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Контрагент, хэш, комментарий" style={{ paddingLeft: 30, width: 260 }} />
          </div>
        </div>
      </div>

      {/* Итоги по разделам — клик фильтрует */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {visibleSections.map((s) => {
          const active = Number(filters.section_id) === s.id;
          const t = tot[s.id] || {};
          return (
            <button key={s.id} onClick={() => setFilters((f) => ({ ...f, section_id: active ? "" : s.id }))}
              style={{ flex: "1 1 200px", textAlign: "left", padding: "12px 14px", background: active ? "#eff6ff" : "#fff", border: `1px solid ${active ? "#93c5fd" : T.border}`, borderRadius: 10, cursor: "pointer", opacity: s.archived ? 0.7 : 1 }}>
              <div style={{ ...T.label, color: s.direction === "in" ? T.green : T.red }}>{s.name}{s.archived ? " · архив" : ""}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{sumText(t.by_asset)}</div>
              <div style={{ ...T.small, fontSize: 11, marginTop: 2 }}>{t.count || 0} транз.{active ? " · фильтр включён" : ""}</div>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 2, background: T.bg, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
            {[["dates", "Списком по датам"], ["sections", "По разделам"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} style={{ padding: "6px 14px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: view === k ? 600 : 400, background: view === k ? "#fff" : "transparent", color: view === k ? T.blue : T.muted, boxShadow: view === k ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>{l}</button>
            ))}
          </div>
          <span style={T.small}>{loading ? "Загрузка…" : `${data.items.length} транзакций`}{activeSection ? ` · ${activeSection.name}` : ""}</span>
          {loading && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
        </div>

        {view === "dates" ? (
          <TxTable items={data.items} secById={secById} showSection onEdit={(t) => setModal({ open: true, tx: t })} onDelete={handleDelete} />
        ) : (
          visibleSections.filter((s) => !activeSection || activeSection.id === s.id).map((s) => (
            <div key={s.id} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <DirPill section={s} />
                <b style={{ fontSize: 14, color: T.ink }}>{s.name}</b>
                <span style={T.small}>{(bySection[s.id] || []).length} транз. · {sumText(tot[s.id]?.by_asset)}</span>
                {!s.archived && (
                  <button style={{ ...S.ghost, padding: "4px 10px", fontSize: 12, marginLeft: "auto" }}
                    onClick={() => setModal({ open: true, tx: null, sectionId: s.id })}><Plus size={12} /> Добавить</button>
                )}
              </div>
              <TxTable items={bySection[s.id] || []} secById={secById} whoTitle={whoLabel(s)}
                onEdit={(t) => setModal({ open: true, tx: t })} onDelete={handleDelete} />
            </div>
          ))
        )}
      </div>

      <TxModal open={modal.open} tx={modal.tx} sections={sections}
        defaultSectionId={modal.sectionId || (activeSection && !activeSection.archived ? activeSection.id : undefined)}
        counterparties={cps} onClose={() => setModal({ open: false, tx: null })} onSaved={refresh} />

      <SectionsModal open={sectionsOpen} sections={sections} onClose={() => setSectionsOpen(false)}
        onChanged={async () => { await loadSections(); load(); }} />

      <Modal open={!!importResult} onClose={() => setImportResult(null)} width={680}
        title="Импорт завершён" subtitle={importResult?.fileName}
        footer={<button className="btn" onClick={() => setImportResult(null)}>Готово</button>}>
        {importResult && (
          <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6 }}>
            <div>Найдено в файле: <b>{importResult.found}</b></div>
            <div style={{ color: T.green }}>Добавлено: <b>{importResult.added}</b></div>
            <div style={{ color: T.muted }}>Пропущено как дубли (уже были): <b>{importResult.duplicates}</b></div>
            <div style={{ marginTop: 8 }}>
              {Object.entries(importResult.by_section || {}).map(([id, n]) => (
                <div key={id} style={T.small}>{secById[id]?.name || `Раздел ${id}`}: {n}</div>
              ))}
            </div>
            {importResult.warnings?.length > 0 && (
              <div style={{ marginTop: 10, padding: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, maxHeight: 220, overflow: "auto" }}>
                <b style={{ color: "#92400e" }}>Предупреждения ({importResult.warnings.length}):</b>
                {importResult.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "#92400e" }}>{w}</div>)}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
