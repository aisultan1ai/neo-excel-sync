import React, { useState, useCallback } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import {
  UploadCloud,
  FileSpreadsheet,
  Play,
  CheckCircle2,
  ArrowRightLeft,
  List,
  FileText,
  Copy,
  ClipboardCheck,
  Loader2,
  Info,
} from "lucide-react";

const styles = `
  .fade-in { animation: fadeIn 0.3s ease-in-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  
  .hover-card { transition: all 0.2s ease; }
  .hover-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }

  .custom-btn { transition: all 0.2s; }
  .custom-btn:hover:not(:disabled) { filter: brightness(110%); transform: translateY(-1px); }
  .custom-btn:active:not(:disabled) { transform: translateY(0); }

  .drop-zone { transition: all 0.2s; border: 2px dashed #cbd5e1; background: #f8fafc; }
  .drop-zone.active { border-color: #3b82f6; background: #eff6ff; }
  .drop-zone:hover { border-color: #94a3b8; }
`;

const SimpleFileBlock = ({
  title,
  file,
  setFile,
  headers,
  setHeaders,
  selectedCol,
  setSelectedCol,
  color,
  showSelect = true,
  description,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (f) => {
    if (!f) return;
    setFile(f);
    if (showSelect && setHeaders) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length > 0) setHeaders(data[0]);
      };
      reader.readAsBinaryString(f);
    }
  };

  const handleFile = (e) => processFile(e.target.files[0]);

  // Drag & Drop handlers
  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      className="card hover-card"
      style={{
        flex: 1,
        minWidth: "320px",
        borderTop: `4px solid ${color}`,
        background: "white",
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
        <div
          style={{
            background: color,
            padding: "10px",
            borderRadius: "10px",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#1e293b" }}>
            {title}
          </h3>
          {description && (
            <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>{description}</p>
          )}
        </div>
      </div>

      {/* Зона Drag & Drop */}
      <div
        className={`drop-zone ${isDragging ? "active" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          marginBottom: "15px",
          borderRadius: "12px",
          padding: "25px",
          textAlign: "center",
          position: "relative",
          cursor: "pointer",
        }}
      >
        <input
          type="file"
          onChange={handleFile}
          accept=".xlsx, .xls, .csv"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
          }}
        />

        {file ? (
          <div
            className="fade-in"
            style={{
              color: "#16a34a",
              fontWeight: 600,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={32} />
            <span style={{ wordBreak: "break-all" }}>{file.name}</span>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
              Нажмите, чтобы заменить
            </span>
          </div>
        ) : (
          <div style={{ color: isDragging ? "#3b82f6" : "#94a3b8", transition: "color 0.2s" }}>
            <UploadCloud size={32} style={{ marginBottom: "8px" }} />
            <div style={{ fontWeight: 500, fontSize: "14px" }}>
              {isDragging ? "Отпустите файл здесь" : "Перетащите файл сюда"}
            </div>
            <div style={{ fontSize: "12px", opacity: 0.7 }}>или нажмите для выбора</div>
          </div>
        )}
      </div>

      {/* Выбор колонки */}
      {showSelect && (
        <div className="fade-in">
          <label
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#475569",
              marginBottom: "6px",
              display: "block",
            }}
          >
            🎯 Колонка поиска (Инструмент)
          </label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedCol}
              onChange={(e) => setSelectedCol(e.target.value)}
              disabled={!headers.length}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: headers.length ? "white" : "#f1f5f9",
                color: "#1e293b",
                fontSize: "14px",
                outline: "none",
                cursor: "pointer",
                transition: "border-color 0.2s",
              }}
            >
              <option value="">
                {headers.length ? "-- Выберите колонку --" : "Сначала загрузите файл"}
              </option>
              {headers.map((h, i) => (
                <option key={i} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

const ComparisonView = () => {
  const [file1, setFile1] = useState(null);
  const [headers1, setHeaders1] = useState([]);
  const [col1, setCol1] = useState("");

  const [file2, setFile2] = useState(null);
  const [headers2, setHeaders2] = useState([]);
  const [col2, setCol2] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("missing2");

  const handleCompare = async () => {
    if (!file1 || !file2 || !col1 || !col2)
      return toast.warning("Пожалуйста, загрузите оба файла и выберите колонки.");

    setLoading(true);
    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("col1", col1);
    formData.append("col2", col2);

    try {
      const res = await axios.post("/api/compare-instruments", formData);
      setResult(res.data);
      toast.success("Сверка завершена успешно!");
    } catch (e) {
      toast.error("Ошибка при сверке. Проверьте файлы.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
          marginBottom: "25px",
          flexShrink: 0,
        }}
      >
        <SimpleFileBlock
          title="Unity"
          description="Основной справочник"
          color="#3b82f6"
          file={file1}
          setFile={setFile1}
          headers={headers1}
          setHeaders={setHeaders1}
          selectedCol={col1}
          setSelectedCol={setCol1}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: "12px",
              borderRadius: "50%",
              color: "#94a3b8",
            }}
          >
            <ArrowRightLeft size={24} />
          </div>
        </div>

        <SimpleFileBlock
          title="Провайдер"
          description="Внешний файл для сверки"
          color="#8b5cf6"
          file={file2}
          setFile={setFile2}
          headers={headers2}
          setHeaders={setHeaders2}
          selectedCol={col2}
          setSelectedCol={setCol2}
        />
      </div>

      <div style={{ textAlign: "center", marginBottom: "30px", flexShrink: 0 }}>
        <button
          className="custom-btn"
          onClick={handleCompare}
          disabled={loading}
          style={{
            padding: "14px 40px",
            fontSize: "16px",
            fontWeight: 600,
            background: loading ? "#94a3b8" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            color: "white",
            border: "none",
            borderRadius: "50px",
            boxShadow: "0 4px 6px -1px rgba(16, 185, 129, 0.3)",
            cursor: loading ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {loading ? (
            <Loader2 className="spin" size={20} />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
          {loading ? "Обработка данных..." : "Начать сверку"}
        </button>
      </div>

      {result && (
        <div
          className="card fade-in"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: 0,
            overflow: "hidden",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc",
              padding: "0 10px",
            }}
          >
            <TabButton
              active={activeTab === "missing2"}
              onClick={() => setActiveTab("missing2")}
              color="#ef4444"
              label="Только в Unity"
              count={result.stats.only_in_1}
            />
            <TabButton
              active={activeTab === "missing1"}
              onClick={() => setActiveTab("missing1")}
              color="#f59e0b"
              label="Только у Провайдера"
              count={result.stats.only_in_2}
            />
            <TabButton
              active={activeTab === "matches"}
              onClick={() => setActiveTab("matches")}
              color="#16a34a"
              label="Совпадения"
              count={result.stats.matches}
            />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f1f5f9", position: "sticky", top: 0, zIndex: 10 }}>
                <tr>
                  <th
                    style={{
                      padding: "15px 24px",
                      textAlign: "left",
                      color: "#64748b",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      padding: "15px 24px",
                      textAlign: "left",
                      color: "#64748b",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Инструмент (Тикер)
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const data =
                    activeTab === "missing2"
                      ? result.data.only_in_unity
                      : activeTab === "missing1"
                        ? result.data.only_in_ais
                        : result.data.matches;

                  if (data.length === 0)
                    return (
                      <tr>
                        <td
                          colSpan="2"
                          style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}
                        >
                          <List size={48} style={{ opacity: 0.2, marginBottom: 15 }} />
                          <div style={{ fontSize: "16px" }}>Список пуст</div>
                        </td>
                      </tr>
                    );

                  return data.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td
                        style={{
                          padding: "12px 24px",
                          width: "60px",
                          color: "#94a3b8",
                          fontSize: "13px",
                        }}
                      >
                        {idx + 1}
                      </td>
                      <td style={{ padding: "12px 24px", fontWeight: 500, color: "#334155" }}>
                        {item}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// --- ГЕНЕРАТОР ОТЧЕТА ---
const ReportView = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!file) return toast.warning("Сначала выберите файл.");
    setLoading(true);
    setReportText("");
    setCopied(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("/api/tools/generate-trade-report", formData);
      if (res.data.status === "success") {
        setReportText(res.data.report);
        toast.success("Отчет успешно сформирован!");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка генерации отчета");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!reportText) return;
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("Текст скопирован!");
  };

  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxWidth: "900px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div style={{ marginBottom: "30px" }}>
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #dbeafe",
            borderRadius: "12px",
            padding: "15px 20px",
            marginBottom: "20px",
            display: "flex",
            gap: "12px",
            alignItems: "start",
          }}
        >
          <Info size={20} color="#3b82f6" style={{ marginTop: "2px" }} />
          <div style={{ fontSize: "14px", color: "#1e40af", lineHeight: "1.5" }}>
            <strong>Как это работает:</strong> Загрузите Excel файл. Система ищет колонки{" "}
            <code>Instrument</code>, <code>Amount</code>, <code>Quote amount</code>. Сделки
            группируются, и формируется текстовое описание для отчета.
          </div>
        </div>

        <SimpleFileBlock
          title="Файл со сделками"
          description="Excel (.xlsx) или CSV"
          color="#f59e0b"
          file={file}
          setFile={setFile}
          showSelect={false}
        />
      </div>

      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <button
          className="custom-btn"
          onClick={handleGenerate}
          disabled={loading}
          style={{
            padding: "14px 40px",
            fontSize: "16px",
            fontWeight: 600,
            background: loading ? "#94a3b8" : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            color: "white",
            border: "none",
            borderRadius: "50px",
            boxShadow: "0 4px 6px -1px rgba(245, 158, 11, 0.3)",
            cursor: loading ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {loading ? <Loader2 className="spin" size={20} /> : <FileText size={20} />}
          {loading ? "Генерация..." : "Создать отчет"}
        </button>
      </div>

      {reportText && (
        <div
          className="fade-in"
          style={{
            flex: 1,
            padding: "25px",
            display: "flex",
            flexDirection: "column",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            border: "1px solid #e2e8f0",
            minHeight: "300px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px",
              paddingBottom: "15px",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <h3 style={{ margin: 0, color: "#1e293b" }}>Результат генерации:</h3>
            <button
              className="custom-btn"
              onClick={copyToClipboard}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                border: `1px solid ${copied ? "#16a34a" : "#cbd5e1"}`,
                background: copied ? "#dcfce7" : "white",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                color: copied ? "#15803d" : "#475569",
                fontWeight: 500,
                fontSize: "14px",
              }}
            >
              {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
              {copied ? "Скопировано!" : "Копировать текст"}
            </button>
          </div>

          <textarea
            readOnly
            value={reportText}
            style={{
              flex: 1,
              width: "100%",
              padding: "20px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
              fontSize: "13px",
              lineHeight: "1.6",
              resize: "none",
              outline: "none",
              background: "#f8fafc",
              color: "#334155",
            }}
          />
        </div>
      )}
    </div>
  );
};

const ReconcileView = () => {
  const [subMode, setSubMode] = useState("twofiles"); // twofiles | duplicates

  // --- twofiles ---
  const [f1, setF1] = useState(null);
  const [h1, setH1] = useState([]);
  const [instCol1, setInstCol1] = useState("Ценная бумага");
  const [opCol1, setOpCol1] = useState("Тип операции ФИ");

  const [f2, setF2] = useState(null);
  const [h2, setH2] = useState([]);
  const [instCol2, setInstCol2] = useState("Instrument");
  const [sideCol2, setSideCol2] = useState("Side");

  const [target, setTarget] = useState("Name Instruments");

  const [twoRes, setTwoRes] = useState(null);

  // --- duplicates ---
  const [fd, setFd] = useState(null);
  const [hd, setHd] = useState([]);
  const [paperCol, setPaperCol] = useState("Ценная бумага");
  const [amountCol, setAmountCol] = useState("Сумма в валюте");
  const [minRepeats, setMinRepeats] = useState(2);
  const [roundTo, setRoundTo] = useState(2);
  const [dupRes, setDupRes] = useState(null);
  const [chosen, setChosen] = useState(null); // {PaperKey, Amount}

  const [loading, setLoading] = useState(false);

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const runTwoFiles = async () => {
    if (!f1 || !f2) return toast.warning("Загрузите оба файла.");
    if (!instCol1 || !opCol1 || !instCol2 || !sideCol2) return toast.warning("Выберите колонки.");

    setLoading(true);
    setTwoRes(null);

    const form = new FormData();
    form.append("file1", f1);
    form.append("file2", f2);
    form.append("col1", instCol1);
    form.append("op1_col", opCol1);
    form.append("col2", instCol2);
    form.append("side2_col", sideCol2);
    form.append("target", target || "");

    try {
      const res = await axios.post("/api/tools/excel-reconcile?mode=twofiles&export=0", form);
      setTwoRes(res.data);
      toast.success("Сверка завершена!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка сверки");
    } finally {
      setLoading(false);
    }
  };

  const exportTwoFiles = async () => {
    if (!f1 || !f2) return toast.warning("Сначала загрузите оба файла.");
    setLoading(true);

    const form = new FormData();
    form.append("file1", f1);
    form.append("file2", f2);
    form.append("col1", instCol1);
    form.append("op1_col", opCol1);
    form.append("col2", instCol2);
    form.append("side2_col", sideCol2);
    form.append("target", target || "");

    try {
      const res = await axios.post("/api/tools/excel-reconcile?mode=twofiles&export=1", form, {
        responseType: "blob",
      });
      downloadBlob(res.data, "export.xlsx");
      toast.info("Excel скачан");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка экспорта");
    } finally {
      setLoading(false);
    }
  };

  const runDuplicates = async (pick = null) => {
    if (!fd) return toast.warning("Загрузите файл.");
    if (!paperCol || !amountCol) return toast.warning("Выберите колонки.");

    setLoading(true);
    if (!pick) setDupRes(null);

    const form = new FormData();
    form.append("file1", fd);
    form.append("paper_col", paperCol);
    form.append("amount_col", amountCol);
    form.append("min_repeats", String(minRepeats));
    form.append("round_to", String(roundTo));
    form.append("chosen_paper_key", pick?.PaperKey || "");
    form.append("chosen_amount", pick?.Amount != null ? String(pick.Amount) : "");

    try {
      const res = await axios.post("/api/tools/excel-reconcile?mode=duplicates&export=0", form);
      setDupRes(res.data);
      toast.success("Готово!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка поиска дубликатов");
    } finally {
      setLoading(false);
    }
  };

  const exportDuplicates = async () => {
    if (!fd) return toast.warning("Сначала загрузите файл.");
    setLoading(true);

    const form = new FormData();
    form.append("file1", fd);
    form.append("paper_col", paperCol);
    form.append("amount_col", amountCol);
    form.append("min_repeats", String(minRepeats));
    form.append("round_to", String(roundTo));
    form.append("chosen_paper_key", "");
    form.append("chosen_amount", "");

    try {
      const res = await axios.post("/api/tools/excel-reconcile?mode=duplicates&export=1", form, {
        responseType: "blob",
      });
      downloadBlob(res.data, "duplicates_export.xlsx");
      toast.info("Excel скачан");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка экспорта");
    } finally {
      setLoading(false);
    }
  };

  const Select = ({ value, onChange, headers, placeholder }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!headers?.length}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid #cbd5e1",
        background: headers?.length ? "white" : "#f1f5f9",
        color: "#1e293b",
        fontSize: "14px",
        outline: "none",
        cursor: "pointer",
      }}
    >
      <option value="">{headers?.length ? placeholder : "Сначала загрузите файл"}</option>
      {headers?.map((h, i) => (
        <option key={i} value={h}>
          {h}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* переключатель подрежима */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div
          style={{ background: "#e2e8f0", padding: 4, borderRadius: 10, display: "flex", gap: 4 }}
        >
          <NavButton
            active={subMode === "twofiles"}
            onClick={() => setSubMode("twofiles")}
            icon={ArrowRightLeft}
            label="АИС / Unity"
          />
          <NavButton
            active={subMode === "duplicates"}
            onClick={() => setSubMode("duplicates")}
            icon={List}
            label="Дубликаты АИС"
          />
        </div>
      </div>

      {subMode === "twofiles" ? (
        <>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <SimpleFileBlock
                title="АИС"
                description="Операции ФИ"
                color="#3b82f6"
                file={f1}
                setFile={setF1}
                headers={h1}
                setHeaders={setH1}
                selectedCol={instCol1}
                setSelectedCol={setInstCol1}
              />
              <div style={{ marginTop: 10 }}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  🧾 Колонка типа операции / Списание / Зачисление
                </label>
                <Select
                  value={opCol1}
                  onChange={setOpCol1}
                  headers={h1}
                  placeholder="-- Выберите колонку --"
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  padding: 12,
                  borderRadius: "50%",
                  color: "#94a3b8",
                }}
              >
                <ArrowRightLeft size={24} />
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 320 }}>
              <SimpleFileBlock
                title="Unity Trades"
                description="Сделки"
                color="#8b5cf6"
                file={f2}
                setFile={setF2}
                headers={h2}
                setHeaders={setH2}
                selectedCol={instCol2}
                setSelectedCol={setInstCol2}
              />
              <div style={{ marginTop: 10 }}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  🧾 Колонка Side (Buy/Sell)
                </label>
                <Select
                  value={sideCol2}
                  onChange={setSideCol2}
                  headers={h2}
                  placeholder="-- Выберите колонку --"
                />
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Инструмент для быстрого просмотра"
              style={{
                width: 420,
                maxWidth: "90%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                outline: "none",
              }}
            />
            <button
              className="custom-btn"
              onClick={runTwoFiles}
              disabled={loading}
              style={{
                padding: "12px 18px",
                fontWeight: 700,
                background: loading ? "#94a3b8" : "linear-gradient(135deg,#10b981 0%,#059669 100%)",
                color: "white",
                border: "none",
                borderRadius: 12,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "..." : "Запуск"}
            </button>
            <button
              className="custom-btn"
              onClick={exportTwoFiles}
              disabled={loading || !twoRes}
              style={{
                padding: "12px 18px",
                fontWeight: 700,
                background: !twoRes ? "#e2e8f0" : "white",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: 12,
                cursor: !twoRes || loading ? "not-allowed" : "pointer",
              }}
            >
              Экспорт Excel
            </button>
          </div>

          {twoRes && (
            <div
              style={{
                background: "white",
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                overflow: "hidden",
                flex: 1,
              }}
            >
              <div
                style={{ padding: 14, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}
              >
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  Итоговая сверка (InstrumentKey + Direction)
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  pairs: {twoRes.stats?.unique_pairs} · file1 parsed:{" "}
                  {twoRes.stats?.matched_keys_file1} · file2 parsed:{" "}
                  {twoRes.stats?.matched_keys_file2}
                </div>
              </div>

              <div style={{ overflow: "auto", maxHeight: "55vh" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f1f5f9" }}>
                    <tr>
                      {[
                        "InstrumentKey",
                        "Direction",
                        "count_file1",
                        "count_file2",
                        "diff_file1_minus_file2",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "12px 14px",
                            fontSize: 12,
                            color: "#64748b",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {twoRes.summary?.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px" }}>{r.InstrumentKey}</td>
                        <td style={{ padding: "10px 14px" }}>{r.Direction}</td>
                        <td style={{ padding: "10px 14px" }}>{r.count_file1}</td>
                        <td style={{ padding: "10px 14px" }}>{r.count_file2}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                          {r.diff_file1_minus_file2}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {twoRes.target_summary?.length > 0 && (
                <div style={{ padding: 14, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 800 }}>
                    Быстрый итог по {String(target || "").toUpperCase()}
                  </div>
                  <pre style={{ margin: 0, color: "#334155", fontSize: 12 }}>
                    {JSON.stringify(twoRes.target_summary, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
            <SimpleFileBlock
              title="АИС"
              description="Файл для поиска дубликатов Операции ФИ"
              color="#f59e0b"
              file={fd}
              setFile={setFd}
              headers={hd}
              setHeaders={setHd}
              selectedCol={paperCol}
              setSelectedCol={setPaperCol}
            />

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}
            >
              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: 6,
                    display: "block",
                  }}
                >
                  💰 Колонка суммы
                </label>
                <Select
                  value={amountCol}
                  onChange={setAmountCol}
                  headers={hd}
                  placeholder="-- Выберите колонку --"
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 6,
                      display: "block",
                    }}
                  >
                    Минимум повторов
                  </label>
                  <input
                    type="number"
                    value={minRepeats}
                    onChange={(e) => setMinRepeats(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#475569",
                      marginBottom: 6,
                      display: "block",
                    }}
                  >
                    Округление
                  </label>
                  <input
                    type="number"
                    value={roundTo}
                    onChange={(e) => setRoundTo(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
              <button
                className="custom-btn"
                onClick={() => {
                  setChosen(null);
                  runDuplicates(null);
                }}
                disabled={loading}
                style={{
                  padding: "12px 18px",
                  fontWeight: 800,
                  background: loading
                    ? "#94a3b8"
                    : "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                }}
              >
                {loading ? "..." : "Найти дубликаты"}
              </button>

              <button
                className="custom-btn"
                onClick={exportDuplicates}
                disabled={loading || !dupRes}
                style={{
                  padding: "12px 18px",
                  fontWeight: 700,
                  background: !dupRes ? "#e2e8f0" : "white",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                  borderRadius: 12,
                  cursor: !dupRes || loading ? "not-allowed" : "pointer",
                }}
              >
                Экспорт Excel
              </button>
            </div>

            {dupRes && (
              <div
                style={{
                  marginTop: 14,
                  background: "white",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{ padding: 14, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}
                >
                  <div style={{ fontWeight: 900 }}>Сводка дубликатов (PaperKey + Amount)</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    groups: {dupRes.stats?.dup_groups} · dup rows: {dupRes.stats?.dup_rows}
                  </div>
                </div>

                <div style={{ overflow: "auto", maxHeight: 280 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, background: "#f1f5f9" }}>
                      <tr>
                        {["PaperKey", "Amount", "count"].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "12px 14px",
                              fontSize: 12,
                              color: "#64748b",
                              borderBottom: "1px solid #e2e8f0",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dupRes.duplicates_summary?.map((r, i) => (
                        <tr
                          key={i}
                          onClick={() => {
                            setChosen({ PaperKey: r.PaperKey, Amount: r.Amount });
                            runDuplicates({ PaperKey: r.PaperKey, Amount: r.Amount });
                          }}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            cursor: "pointer",
                            background:
                              chosen && chosen.PaperKey === r.PaperKey && chosen.Amount === r.Amount
                                ? "#eff6ff"
                                : "transparent",
                          }}
                        >
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
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>
                      Строки для: {chosen?.PaperKey} + {chosen?.Amount}
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 12,
                        maxHeight: 240,
                        overflow: "auto",
                        background: "#f8fafc",
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {JSON.stringify(dupRes.chosen_rows, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, color, label, count }) => (
  <button
    onClick={onClick}
    style={{
      padding: "16px 10px",
      border: "none",
      background: "transparent",
      borderBottom: active ? `3px solid ${color}` : "3px solid transparent",
      fontWeight: active ? 700 : 500,
      color: active ? color : "#64748b",
      cursor: "pointer",
      flex: 1,
      textAlign: "center",
      transition: "all 0.2s",
      fontSize: "14px",
    }}
  >
    {label}
    <span
      style={{
        marginLeft: 8,
        background: active ? color : "#e2e8f0",
        color: active ? "white" : "#64748b",
        padding: "2px 8px",
        borderRadius: "20px",
        fontSize: "11px",
        verticalAlign: "middle",
      }}
    >
      {count}
    </span>
  </button>
);

const NavButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    className="custom-btn"
    onClick={onClick}
    style={{
      padding: "8px 16px",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: 600,
      fontSize: "14px",
      background: active ? "white" : "transparent",
      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
      color: active ? "#0f172a" : "#64748b",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "all 0.2s",
    }}
  >
    <Icon size={16} />
    {label}
  </button>
);

const InstrumentsPage = () => {
  const [viewMode, setViewMode] = useState("compare");

  return (
    <>
      <style>
        {styles +
          ` .spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } `}
      </style>

      <div
        style={{
          padding: "20px 40px",
          height: "calc(100vh - 60px)",
          display: "flex",
          flexDirection: "column",
          background: "#f1f5f9",
          borderRadius: "16px 0 0 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "30px",
          }}
        >
          <div>
            <h1
              style={{ fontSize: "28px", margin: "0 0 5px 0", color: "#0f172a", fontWeight: 700 }}
            >
              Инструменты
            </h1>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              Управление справочниками и генерация отчетов
            </p>
          </div>

          <div
            style={{
              background: "#e2e8f0",
              padding: "4px",
              borderRadius: "10px",
              display: "flex",
              gap: "4px",
            }}
          >
            <NavButton
              active={viewMode === "compare"}
              onClick={() => setViewMode("compare")}
              icon={ArrowRightLeft}
              label="Сверка Инструментов"
            />
            <NavButton
              active={viewMode === "reconcile"}
              onClick={() => setViewMode("reconcile")}
              icon={ClipboardCheck}
              label="Сверка Transaction/Trade"
            />
            <NavButton
              active={viewMode === "report"}
              onClick={() => setViewMode("report")}
              icon={FileText}
              label="Генератор отчетов VISION"
            />
          </div>
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          {viewMode === "compare" ? (
            <ComparisonView />
          ) : viewMode === "report" ? (
            <ReportView />
          ) : (
            <ReconcileView />
          )}
        </div>
      </div>
    </>
  );
};

export default InstrumentsPage;
