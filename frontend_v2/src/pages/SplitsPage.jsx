import React, { useMemo, useState } from "react";
import {
  Layers,
  AlertCircle,
  CheckCircle,
  Upload,
  FileSpreadsheet,
  X,
  Database,
  Eye,
  EyeOff,
  Save,
  Search,
  FileUp,
} from "lucide-react";
import { toast } from "react-toastify";

import { api } from "../api/client";

export default function SplitsPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [refFile, setRefFile] = useState(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  async function handleCheck() {
    if (!file) {
      toast.error("Пожалуйста, выберите файл для проверки.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("daily_file", file);

    try {
      const settingsRes = await api.get("/api/v2/settings");
      formData.append("settings_json", JSON.stringify(settingsRes.data));

      const res = await api.post("/api/v2/check-splits", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.status === "error") {
        setError(res.data.message);
      } else {
        setResult(res.data);
        toast.success("Проверка завершена");
      }
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.detail || "Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  function clearFile(event) {
    event.stopPropagation();
    setFile(null);
    setResult(null);
    setError(null);
  }

  async function handleUploadReference() {
    if (!refFile) return;

    setUploadingRef(true);
    const formData = new FormData();
    formData.append("file", refFile);

    try {
      await api.post("/api/v2/settings/upload-split-list", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setRefFile(null);
      toast.success("Справочник сплитов успешно обновлен");

      if (showTable) {
        await handleViewCurrentList(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.detail || "Ошибка загрузки справочника");
    } finally {
      setUploadingRef(false);
    }
  }

  async function handleViewCurrentList(forceUpdate = false) {
    if (showTable && viewData && !forceUpdate) {
      setShowTable(false);
      return;
    }

    setLoadingView(true);
    try {
      const res = await api.get("/api/v2/settings/split-list-content");

      if (res.data.status === "empty") {
        toast.info(res.data.message || "Справочник пуст");
      } else {
        setViewData(res.data.data || []);
        setShowTable(true);
      }
    } catch (err) {
      console.error(err);
      toast.error("Не удалось загрузить данные справочника");
    } finally {
      setLoadingView(false);
    }
  }

  const filteredData = useMemo(() => {
    if (!viewData) return [];
    if (!searchTerm.trim()) return viewData;

    const lowerTerm = searchTerm.toLowerCase();
    return viewData.filter((row) =>
      Object.values(row).some((val) => String(val ?? "").toLowerCase().includes(lowerTerm))
    );
  }, [viewData, searchTerm]);

  return (
    <div className="page splits-page">
      <h1>Проверка сплитов</h1>

      <div className="card splits-main-card">
        <div className="splits-section-head">
          <h3>
            <Layers size={22} color="#2563eb" />
            <span>Шаг 1. Загрузка ежедневного отчета (АИС)</span>
          </h3>
          <p>Загрузите файл для проверки. Он будет сверен с текущим справочником.</p>
        </div>

        <div
          className={`splits-upload-box ${file ? "has-file" : ""}`}
          onClick={() => document.getElementById("split-file-upload")?.click()}
        >
          <input
            id="split-file-upload"
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {!file ? (
            <div className="splits-upload-empty">
              <div className="splits-upload-icon">
                <Upload size={30} color="#2563eb" />
              </div>
              <div>
                <span>Нажмите, чтобы загрузить</span>
                <small>или перетащите файл сюда</small>
              </div>
            </div>
          ) : (
            <div className="splits-upload-file">
              <div className="splits-upload-file-main">
                <FileSpreadsheet size={40} color="#10b981" />
                <div>
                  <div className="splits-file-name">{file.name}</div>
                  <div className="splits-file-size">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
              </div>

              <button className="icon-btn danger" onClick={clearFile} type="button">
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="splits-actions-row">
          <button
            className="save-btn"
            onClick={handleCheck}
            disabled={loading || !file}
            type="button"
          >
            {loading ? "Анализ..." : "Проверить файл"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card splits-alert-card error">
          <div className="splits-alert-head">
            <AlertCircle color="#b91c1c" />
            <h3>Ошибка</h3>
          </div>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div
          className={`card splits-alert-card ${
            result.data?.length > 0 ? "warning" : "success"
          }`}
        >
          <div className="splits-alert-head">
            {result.data?.length > 0 ? (
              <AlertCircle color="#ca8a04" size={28} />
            ) : (
              <CheckCircle color="#16a34a" size={28} />
            )}

            <div>
              <h3>
                {result.data?.length > 0
                  ? `Найдено сплитов: ${result.data.length}`
                  : "Сплитов не обнаружено"}
              </h3>
              <p>
                {result.data?.length > 0
                  ? "Позиции требуют внимания"
                  : "В загруженном файле нет позиций из списка сплитов"}
              </p>
            </div>
          </div>

          {result.data?.length > 0 && (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ISIN</th>
                    <th>Счет</th>
                    <th>Количество</th>
                    <th>Название ЦБ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row["ISIN"]}</td>
                      <td>{row["Счет"]}</td>
                      <td>{row["Количество"]}</td>
                      <td>{row["Полное название ЦБ"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="splits-admin-block">
        <h2>
          <Database size={22} />
          <span>Управление справочником</span>
        </h2>

        <div className="splits-admin-grid">
          <div className="card splits-admin-card">
            <h4>Обновить базу</h4>
            <p>Загрузите Excel-файл, чтобы заменить текущий список сплитов.</p>

            <div className="splits-ref-row">
              <input
                id="ref-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) => setRefFile(e.target.files?.[0] || null)}
              />

              {!refFile ? (
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => document.getElementById("ref-upload")?.click()}
                >
                  <FileUp size={16} />
                  <span>Выбрать файл...</span>
                </button>
              ) : (
                <div className="splits-ref-selected">
                  <div className="splits-ref-name">📄 {refFile.name}</div>

                  <button
                    className="save-btn"
                    type="button"
                    disabled={uploadingRef}
                    onClick={handleUploadReference}
                  >
                    <Save size={16} />
                    <span>{uploadingRef ? "..." : "Сохранить"}</span>
                  </button>

                  <button
                    className="icon-btn danger"
                    type="button"
                    onClick={() => setRefFile(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card splits-admin-card">
            <h4>Просмотр базы</h4>
            <p>Открыть таблицу текущих сплитов для проверки данных.</p>

            <button className="secondary-btn" type="button" onClick={() => handleViewCurrentList()}>
              {showTable ? <EyeOff size={18} /> : <Eye size={18} />}
              <span>{loadingView ? "Загрузка..." : showTable ? "Скрыть таблицу" : "Открыть таблицу"}</span>
            </button>
          </div>
        </div>

        {showTable && viewData && (
          <div className="card splits-table-card">
            <div className="splits-table-toolbar">
              <div className="splits-table-count">
                Записей: {filteredData.length}{" "}
                <span>(всего {viewData.length})</span>
              </div>

              <div className="splits-search-wrap">
                <Search size={16} className="splits-search-icon" />
                <input
                  type="text"
                  placeholder="Поиск по справочнику..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="table-wrap splits-reference-table">
              <table className="admin-table">
                <thead>
                  <tr>
                    {viewData.length > 0 &&
                      Object.keys(viewData[0]).map((key) => <th key={key}>{key}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length > 0 ? (
                    filteredData.map((row, idx) => (
                      <tr key={idx}>
                        {Object.values(row).map((val, i) => (
                          <td key={i}>{String(val ?? "")}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="100%">Ничего не найдено</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}