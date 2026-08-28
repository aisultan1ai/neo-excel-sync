import React, { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import {
  UploadCloud,
  FileSpreadsheet,
  Play,
  CheckCircle2,
  ArrowRightLeft,
  Search,
  Info,
  Loader2,
  List,
} from "lucide-react";

import { api } from "../api/client";

const SimpleFileBlock = ({
  title,
  file,
  setFile,
  headers,
  setHeaders,
  selectedCol,
  setSelectedCol,
  color,
  description,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (f) => {
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length > 0) setHeaders(data[0] || []);
      } catch (e) {
        console.error(e);
        toast.error("Не удалось прочитать заголовки файла");
      }
    };
    reader.readAsBinaryString(f);
  };

  const handleFile = (e) => processFile(e.target.files?.[0]);

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
    processFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="instr-file-card">
      <div className="instr-file-title">
        <div className="instr-file-icon" style={{ background: color }}>
          <FileSpreadsheet size={20} />
        </div>

        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      </div>

      <div
        className={`instr-drop-zone ${isDragging ? "active" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          type="file"
          onChange={handleFile}
          accept=".xlsx,.xls,.csv"
          className="instr-drop-input"
        />

        {file ? (
          <div className="instr-file-picked">
            <CheckCircle2 size={32} />
            <span>{file.name}</span>
            <small>Нажмите, чтобы заменить</small>
          </div>
        ) : (
          <div className="instr-file-empty">
            <UploadCloud size={32} />
            <div className="instr-file-empty-main">
              {isDragging ? "Отпустите файл здесь" : "Перетащите файл сюда"}
            </div>
            <div className="instr-file-empty-sub">или нажмите для выбора</div>
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Колонка инструмента</label>
        <select
          value={selectedCol}
          onChange={(e) => setSelectedCol(e.target.value)}
          disabled={!headers.length}
        >
          <option value="">
            {headers.length ? "-- Выберите колонку --" : "Сначала загрузите файл"}
          </option>
          {headers.map((h, i) => (
            <option key={`${String(h)}_${i}`} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

function ResultsTable({ data, activeTab }) {
  const [search, setSearch] = useState("");

  const rows = Array.isArray(data) ? data : [];
  const q = search.trim().toLowerCase();

  const filtered = !q
    ? rows
    : rows.filter((row) =>
        Object.values(row || {}).some((val) =>
          String(val ?? "").toLowerCase().includes(q)
        )
      );

  const isMatches = activeTab === "matches";

  return (
    <div className="instr-results-shell">
      <div className="instr-results-topbar">
        <div className="instr-search-box">
          <Search size={16} color="#94a3b8" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по результатам..."
          />
        </div>

        <div className="instr-count-note">
          Показано: {filtered.length}
        </div>
      </div>

      <div className="instr-table-wrap">
        <table className="instr-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Инструмент</th>
              {isMatches && (
                <>
                  <th>Unity</th>
                  <th>Provider</th>
                  <th>Diff</th>
                </>
              )}
              {!isMatches && activeTab === "missing2" && <th>Unity</th>}
              {!isMatches && activeTab === "missing1" && <th>Provider</th>}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isMatches ? 5 : 3} className="instr-empty-cell">
                  <List size={42} />
                  <div>Список пуст</div>
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{row.instrument}</td>

                  {isMatches && (
                    <>
                      <td>{row.count_file1 ?? 0}</td>
                      <td>{row.count_file2 ?? 0}</td>
                      <td><b>{row.diff ?? 0}</b></td>
                    </>
                  )}

                  {!isMatches && activeTab === "missing2" && <td>{row.count_file1 ?? 0}</td>}
                  {!isMatches && activeTab === "missing1" && <td>{row.count_file2 ?? 0}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TabButton = ({ active, onClick, color, label, count }) => (
  <button
    onClick={onClick}
    className={`instr-tab-btn ${active ? "active" : ""}`}
    style={{
      borderBottomColor: active ? color : "transparent",
      color: active ? color : "#64748b",
    }}
    type="button"
  >
    {label}
    <span
      className="instr-tab-count"
      style={{
        background: active ? color : "#e2e8f0",
        color: active ? "white" : "#64748b",
      }}
    >
      {count}
    </span>
  </button>
);

export default function InstrumentsPage() {
  const [file1, setFile1] = useState(null);
  const [headers1, setHeaders1] = useState([]);
  const [col1, setCol1] = useState("");

  const [file2, setFile2] = useState(null);
  const [headers2, setHeaders2] = useState([]);
  const [col2, setCol2] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("missing2");

  async function handleCompare() {
    if (!file1 || !file2 || !col1 || !col2) {
      return toast.warning("Пожалуйста, загрузите оба файла и выберите колонки.");
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("col1", col1);
    formData.append("col2", col2);

    try {
      const res = await api.post("/api/v2/compare-instruments", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResult(res.data);
      toast.success("Сверка завершена успешно");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Ошибка при сверке");
    } finally {
      setLoading(false);
    }
  }

  const getTabData = () => {
    if (!result?.data) return [];
    if (activeTab === "missing2") return result.data.only_in_unity || [];
    if (activeTab === "missing1") return result.data.only_in_ais || [];
    return result.data.matches || [];
  };

  return (
    <div className="page instr-page">
      <div className="instr-page-head">
        <div>
          <h1>Инструменты</h1>
          <p>Сверка справочников инструментов между Unity и внешним провайдером</p>
        </div>
      </div>

      <div className="instr-info-box">
        <Info size={18} color="#3b82f6" />
        <div>
          Сейчас во `v2` перенесен рабочий режим <b>«Сверка инструментов»</b>. Старые режимы
          для transaction/trade и генератора VISION можно вернуть отдельным этапом.
        </div>
      </div>

      <div className="instr-files-row">
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

        <div className="instr-middle-icon">
          <ArrowRightLeft size={24} />
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

      <div className="instr-run-row">
        <button className="save-btn instr-run-btn" onClick={handleCompare} disabled={loading} type="button">
          {loading ? <Loader2 className="instr-spin" size={20} /> : <Play size={20} />}
          <span>{loading ? "Обработка..." : "Начать сверку"}</span>
        </button>
      </div>

      {result && (
        <div className="card instr-results-card">
          <div className="instr-tabs-row">
            <TabButton
              active={activeTab === "missing2"}
              onClick={() => setActiveTab("missing2")}
              color="#ef4444"
              label="Только в Unity"
              count={result?.stats?.only_in_1 ?? 0}
            />

            <TabButton
              active={activeTab === "missing1"}
              onClick={() => setActiveTab("missing1")}
              color="#f59e0b"
              label="Только у Провайдера"
              count={result?.stats?.only_in_2 ?? 0}
            />

            <TabButton
              active={activeTab === "matches"}
              onClick={() => setActiveTab("matches")}
              color="#16a34a"
              label="Совпадения"
              count={result?.stats?.matches ?? 0}
            />
          </div>

          <div className="instr-stats-line">
            unique_file1: {result?.stats?.unique_file1} · unique_file2: {result?.stats?.unique_file2} ·
            rows_file1: {result?.stats?.rows_file1} · rows_file2: {result?.stats?.rows_file2}
          </div>

          <ResultsTable data={getTabData()} activeTab={activeTab} />
        </div>
      )}
    </div>
  );
}