import React, { useState } from "react";
import { toast } from "react-toastify";
import { ArrowRightLeft, List } from "lucide-react";
import axios from "axios";
import { SimpleFileBlock, NavButton } from "./ui";

const ColSelect = ({ value, onChange, headers, placeholder }) => (
  <select
    value={value} onChange={(e) => onChange(e.target.value)} disabled={!headers?.length}
    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", background: headers?.length ? "white" : "#f1f5f9", color: "#1e293b", fontSize: "14px", outline: "none", cursor: "pointer" }}
  >
    <option value="">{headers?.length ? placeholder : "Сначала загрузите файл"}</option>
    {headers?.map((h, i) => <option key={i} value={h}>{h}</option>)}
  </select>
);

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  window.URL.revokeObjectURL(url);
};

const ReconcileView = () => {
  const [subMode, setSubMode] = useState("twofiles");

  const [f1, setF1] = useState(null); const [h1, setH1] = useState([]);
  const [instCol1, setInstCol1] = useState("Ценная бумага");
  const [opCol1, setOpCol1] = useState("Тип операции ФИ");

  const [f2, setF2] = useState(null); const [h2, setH2] = useState([]);
  const [instCol2, setInstCol2] = useState("Instrument");
  const [sideCol2, setSideCol2] = useState("Side");
  const [target, setTarget] = useState("Name Instruments");
  const [twoRes, setTwoRes] = useState(null);

  const [fd, setFd] = useState(null); const [hd, setHd] = useState([]);
  const [paperCol, setPaperCol] = useState("Ценная бумага");
  const [amountCol, setAmountCol] = useState("Сумма в валюте");
  const [minRepeats, setMinRepeats] = useState(2);
  const [roundTo, setRoundTo] = useState(2);
  const [dupRes, setDupRes] = useState(null);
  const [chosen, setChosen] = useState(null);

  const [loading, setLoading] = useState(false);

  const runTwoFiles = async () => {
    if (!f1 || !f2) return toast.warning("Загрузите оба файла.");
    if (!instCol1 || !opCol1 || !instCol2 || !sideCol2) return toast.warning("Выберите колонки.");
    setLoading(true); setTwoRes(null);
    const form = new FormData();
    form.append("file1", f1); form.append("file2", f2);
    form.append("col1", instCol1); form.append("op1_col", opCol1);
    form.append("col2", instCol2); form.append("side2_col", sideCol2);
    form.append("target", target || "");
    try {
      const res = await axios.post("/api/v1/tools/excel-reconcile?mode=twofiles&export=0", form);
      setTwoRes(res.data); toast.success("Сверка завершена!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка сверки");
    } finally { setLoading(false); }
  };

  const exportTwoFiles = async () => {
    if (!f1 || !f2) return toast.warning("Сначала загрузите оба файла.");
    setLoading(true);
    const form = new FormData();
    form.append("file1", f1); form.append("file2", f2);
    form.append("col1", instCol1); form.append("op1_col", opCol1);
    form.append("col2", instCol2); form.append("side2_col", sideCol2);
    form.append("target", target || "");
    try {
      const res = await axios.post("/api/v1/tools/excel-reconcile?mode=twofiles&export=1", form, { responseType: "blob" });
      downloadBlob(res.data, "export.xlsx"); toast.info("Excel скачан");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка экспорта");
    } finally { setLoading(false); }
  };

  const runDuplicates = async (pick = null) => {
    if (!fd) return toast.warning("Загрузите файл.");
    if (!paperCol || !amountCol) return toast.warning("Выберите колонки.");
    setLoading(true);
    if (!pick) setDupRes(null);
    const form = new FormData();
    form.append("file1", fd); form.append("paper_col", paperCol);
    form.append("amount_col", amountCol); form.append("min_repeats", String(minRepeats));
    form.append("round_to", String(roundTo));
    form.append("chosen_paper_key", pick?.PaperKey || "");
    form.append("chosen_amount", pick?.Amount != null ? String(pick.Amount) : "");
    try {
      const res = await axios.post("/api/v1/tools/excel-reconcile?mode=duplicates&export=0", form);
      setDupRes(res.data); toast.success("Готово!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка поиска дубликатов");
    } finally { setLoading(false); }
  };

  const exportDuplicates = async () => {
    if (!fd) return toast.warning("Сначала загрузите файл.");
    setLoading(true);
    const form = new FormData();
    form.append("file1", fd); form.append("paper_col", paperCol);
    form.append("amount_col", amountCol); form.append("min_repeats", String(minRepeats));
    form.append("round_to", String(roundTo));
    form.append("chosen_paper_key", ""); form.append("chosen_amount", "");
    try {
      const res = await axios.post("/api/v1/tools/excel-reconcile?mode=duplicates&export=1", form, { responseType: "blob" });
      downloadBlob(res.data, "duplicates_export.xlsx"); toast.info("Excel скачан");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка экспорта");
    } finally { setLoading(false); }
  };

  const labelStyle = { fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6, display: "block" };
  const btnRun = { padding: "12px 18px", fontWeight: 700, color: "white", border: "none", borderRadius: 12 };
  const btnExport = { padding: "12px 18px", fontWeight: 700, background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 12 };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div style={{ background: "#e2e8f0", padding: 4, borderRadius: 10, display: "flex", gap: 4 }}>
          <NavButton active={subMode === "twofiles"} onClick={() => setSubMode("twofiles")} icon={ArrowRightLeft} label="АИС / Unity" />
          <NavButton active={subMode === "duplicates"} onClick={() => setSubMode("duplicates")} icon={List} label="Дубликаты АИС" />
        </div>
      </div>

      {subMode === "twofiles" ? (
        <>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <SimpleFileBlock title="АИС" description="Операции ФИ" color="#3b82f6"
                file={f1} setFile={setF1} headers={h1} setHeaders={setH1} selectedCol={instCol1} setSelectedCol={setInstCol1} />
              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>🧾 Колонка типа операции / Списание / Зачисление</label>
                <ColSelect value={opCol1} onChange={setOpCol1} headers={h1} placeholder="-- Выберите колонку --" />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: 12, borderRadius: "50%", color: "#94a3b8" }}>
                <ArrowRightLeft size={24} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 320 }}>
              <SimpleFileBlock title="Unity Trades" description="Сделки" color="#8b5cf6"
                file={f2} setFile={setF2} headers={h2} setHeaders={setH2} selectedCol={instCol2} setSelectedCol={setInstCol2} />
              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>🧾 Колонка Side (Buy/Sell)</label>
                <ColSelect value={sideCol2} onChange={setSideCol2} headers={h2} placeholder="-- Выберите колонку --" />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <input value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder="Инструмент для быстрого просмотра"
              style={{ width: 420, maxWidth: "90%", padding: "12px 14px", borderRadius: 10, border: "1px solid #cbd5e1", outline: "none" }} />
            <button className="custom-btn" onClick={runTwoFiles} disabled={loading}
              style={{ ...btnRun, background: loading ? "#94a3b8" : "linear-gradient(135deg,#10b981 0%,#059669 100%)", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "..." : "Запуск"}
            </button>
            <button className="custom-btn" onClick={exportTwoFiles} disabled={loading || !twoRes}
              style={{ ...btnExport, cursor: !twoRes || loading ? "not-allowed" : "pointer" }}>
              Экспорт Excel
            </button>
          </div>

          {twoRes && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", flex: 1 }}>
              <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>Итоговая сверка (InstrumentKey + Direction)</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  pairs: {twoRes.stats?.unique_pairs} · file1 parsed: {twoRes.stats?.matched_keys_file1} · file2 parsed: {twoRes.stats?.matched_keys_file2}
                </div>
              </div>
              <div style={{ overflow: "auto", maxHeight: "55vh" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f1f5f9" }}>
                    <tr>{["InstrumentKey", "Direction", "count_file1", "count_file2", "diff_file1_minus_file2"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "12px 14px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {twoRes.summary?.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px" }}>{r.InstrumentKey}</td>
                        <td style={{ padding: "10px 14px" }}>{r.Direction}</td>
                        <td style={{ padding: "10px 14px" }}>{r.count_file1}</td>
                        <td style={{ padding: "10px 14px" }}>{r.count_file2}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.diff_file1_minus_file2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {twoRes.target_summary?.length > 0 && (
                <div style={{ padding: 14, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 800 }}>Быстрый итог по {String(target || "").toUpperCase()}</div>
                  <pre style={{ margin: 0, color: "#334155", fontSize: 12 }}>{JSON.stringify(twoRes.target_summary, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
          <SimpleFileBlock title="АИС" description="Файл для поиска дубликатов Операции ФИ" color="#f59e0b"
            file={fd} setFile={setFd} headers={hd} setHeaders={setHd} selectedCol={paperCol} setSelectedCol={setPaperCol} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label style={labelStyle}>💰 Колонка суммы</label>
              <ColSelect value={amountCol} onChange={setAmountCol} headers={hd} placeholder="-- Выберите колонку --" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Минимум повторов</label>
                <input type="number" value={minRepeats} onChange={(e) => setMinRepeats(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Округление</label>
                <input type="number" value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
            <button className="custom-btn" onClick={() => { setChosen(null); runDuplicates(null); }} disabled={loading}
              style={{ ...btnRun, background: loading ? "#94a3b8" : "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)" }}>
              {loading ? "..." : "Найти дубликаты"}
            </button>
            <button className="custom-btn" onClick={exportDuplicates} disabled={loading || !dupRes}
              style={{ ...btnExport, cursor: !dupRes || loading ? "not-allowed" : "pointer" }}>
              Экспорт Excel
            </button>
          </div>

          {dupRes && (
            <div style={{ marginTop: 14, background: "white", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontWeight: 900 }}>Сводка дубликатов (PaperKey + Amount)</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>groups: {dupRes.stats?.dup_groups} · dup rows: {dupRes.stats?.dup_rows}</div>
              </div>
              <div style={{ overflow: "auto", maxHeight: 280 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f1f5f9" }}>
                    <tr>{["PaperKey", "Amount", "count"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "12px 14px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {dupRes.duplicates_summary?.map((r, i) => (
                      <tr key={i} onClick={() => { setChosen({ PaperKey: r.PaperKey, Amount: r.Amount }); runDuplicates({ PaperKey: r.PaperKey, Amount: r.Amount }); }}
                        style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: chosen && chosen.PaperKey === r.PaperKey && chosen.Amount === r.Amount ? "#eff6ff" : "transparent" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.PaperKey}</td>
                        <td style={{ padding: "10px 14px" }}>{r.Amount}</td>
                        <td style={{ padding: "10px 14px" }}>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dupRes.chosen_rows?.length > 0 && (
                <div style={{ padding: 14, borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Строки для: {chosen?.PaperKey} + {chosen?.Amount}</div>
                  <pre style={{ margin: 0, fontSize: 12, maxHeight: 240, overflow: "auto", background: "#f8fafc", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                    {JSON.stringify(dupRes.chosen_rows, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReconcileView;
