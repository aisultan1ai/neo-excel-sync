import React, { useState } from 'react';
import axios from 'axios';
import {
  Layers, AlertCircle, CheckCircle, Upload,
  FileSpreadsheet, X, Database, Eye, EyeOff, Save, Search, FileUp
} from 'lucide-react';
import { toast } from 'react-toastify';

const SplitsPage = () => {
  // --- СОСТОЯНИЕ ДЛЯ ПРОВЕРКИ (ОСНОВНОЕ) ---
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // --- СОСТОЯНИЕ ДЛЯ СПРАВОЧНИКА ---
  const [refFile, setRefFile] = useState(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [showTable, setShowTable] = useState(false);

  // Новое: Поиск по таблице
  const [searchTerm, setSearchTerm] = useState("");

  // 1. ПРОВЕРКА ФАЙЛА
  const handleCheck = async () => {
    if (!file) {
      toast.error("Пожалуйста, выберите файл для проверки.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append('daily_file', file);

    try {
        const settingsRes = await axios.get('/api/settings');
        formData.append('settings_json', JSON.stringify(settingsRes.data));

        const res = await axios.post('/api/check-splits', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (res.data.status === 'error') {
            setError(res.data.message);
        } else {
            setResult(res.data);
            toast.success("Проверка завершена");
        }
    } catch (err) {
        console.error(err);
        setError(err.response?.data?.detail || "Ошибка соединения с сервером");
    } finally {
        setLoading(false);
    }
  };

  const clearFile = (e) => {
    e.stopPropagation();
    setFile(null);
    setResult(null);
  };

  // 2. ЗАГРУЗКА НОВОГО СПРАВОЧНИКА
  const handleUploadReference = async () => {
    if (!refFile) return;

    setUploadingRef(true);
    const formData = new FormData();
    formData.append('file', refFile);

    try {
        await axios.post('/api/settings/upload-split-list', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        setRefFile(null);
        toast.success("Справочник сплитов успешно обновлен!");

        // Если таблица открыта, обновим её данные
        if (showTable) {
            handleViewCurrentList(true); // true = force update
        }

    } catch (err) {
        console.error(err);
        toast.error("Ошибка загрузки справочника");
    } finally {
        setUploadingRef(false);
    }
  };

  // 3. ПРОСМОТР ТЕКУЩЕГО СПРАВОЧНИКА
  const handleViewCurrentList = async (forceUpdate = false) => {
    if (showTable && viewData && !forceUpdate) {
        setShowTable(false);
        return;
    }

    setLoadingView(true);
    try {
        const res = await axios.get('/api/settings/split-list-content');
        if (res.data.status === 'empty') {
            toast.info(res.data.message);
        } else {
            setViewData(res.data.data);
            setShowTable(true);
        }
    } catch (err) {
        console.error(err);
        toast.error("Не удалось загрузить данные справочника");
    } finally {
        setLoadingView(false);
    }
  };

  // Логика фильтрации таблицы
  const filteredData = viewData
    ? viewData.filter(row => {
        if (!searchTerm) return true;
        const lowerTerm = searchTerm.toLowerCase();
        return Object.values(row).some(val =>
            String(val).toLowerCase().includes(lowerTerm)
        );
      })
    : [];

  return (
    <div style={{ width: '100%', paddingRight: '20px', paddingBottom: '50px' }}>
      <h1 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
         Проверка Сплитов
      </h1>

      {/* --- ПРОВЕРКА ФАЙЛА --- */}
      <div className="card" style={{ padding: '30px' }}>
        <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={24} color="#3b82f6" />
                Шаг 1. Загрузка ежедневного отчета (АИС)
            </h3>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#64748b' }}>
                Загрузите файл для проверки. Он будет сверен с текущим справочником.
            </p>
        </div>

        <div
            style={{
                border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '40px 20px',
                textAlign: 'center', cursor: 'pointer',
                backgroundColor: file ? '#f0f9ff' : '#f8fafc',
                transition: 'all 0.2s ease', position: 'relative'
            }}
            onClick={() => document.getElementById('split-file-upload').click()}
            onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
        >
            <input id="split-file-upload" type="file" accept=".xlsx, .xls" hidden onChange={e => setFile(e.target.files[0])} />

            {!file ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: '#e0f2fe', padding: '15px', borderRadius: '50%' }}><Upload size={30} color="#3b82f6" /></div>
                    <div>
                        <span style={{ color: '#3b82f6', fontWeight: 600 }}>Нажмите, чтобы загрузить</span>
                        <br /><span style={{ fontSize: '13px', color: '#94a3b8' }}>или перетащите файл сюда</span>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
                    <FileSpreadsheet size={40} color="#10b981" />
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{file.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button onClick={clearFile} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '20px' }}><X size={16} color="#ef4444" /></button>
                </div>
            )}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={handleCheck} disabled={loading || !file} style={{ height: '45px', padding: '0 30px', opacity: (!file || loading) ? 0.6 : 1 }}>
                {loading ? 'Анализ...' : 'Проверить файл'}
            </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{borderLeft: '5px solid #ef4444', backgroundColor: '#fef2f2', marginTop: '20px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#b91c1c'}}><AlertCircle /> <h3>Ошибка</h3></div>
            <p style={{ margin: '10px 0' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: '20px', borderLeft: result.data.length > 0 ? '5px solid #eab308' : '5px solid #10b981' }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px'}}>
                {result.data.length > 0 ? <AlertCircle color="#eab308" size={28} /> : <CheckCircle color="#10b981" size={28} />}
                <div>
                    <h3 style={{margin: 0}}>{result.data.length > 0 ? `Найдено сплитов: ${result.data.length}` : "Сплитов не обнаружено"}</h3>
                    <p style={{margin: '2px 0 0 0', fontSize: '13px', color: '#64748b'}}>{result.data.length > 0 ? "Позиции требуют внимания" : "В загруженном файле нет позиций из списка сплитов"}</p>
                </div>
            </div>
            {result.data.length > 0 && (
                <div style={{overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
                        <thead>
                            <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left'}}>
                                <th style={{padding: '12px 15px', color: '#475569'}}>ISIN</th>
                                <th style={{padding: '12px 15px', color: '#475569'}}>Счет</th>
                                <th style={{padding: '12px 15px', color: '#475569'}}>Количество</th>
                                <th style={{padding: '12px 15px', color: '#475569'}}>Название ЦБ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.data.map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{padding: '12px 15px', fontWeight: 500}}>{row['ISIN']}</td>
                                    <td style={{padding: '12px 15px'}}>{row['Счет']}</td>
                                    <td style={{padding: '12px 15px'}}>{row['Количество']}</td>
                                    <td style={{padding: '12px 15px', color: '#64748b'}}>{row['Полное название ЦБ']}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      )}

      <div style={{ marginTop: '40px', borderTop: '1px solid #e2e8f0', paddingTop: '30px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', color: '#475569' }}>
            <Database size={24} /> Управление справочником (База сплитов)
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

            <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h4 style={{ marginTop: 0, marginBottom: '5px' }}>Обновить базу</h4>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '15px' }}>
                    Загрузите Excel-файл, чтобы заменить текущий список сплитов.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Скрытый инпут и кастомная кнопка */}
                    <input
                        id="ref-upload"
                        type="file"
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                        onChange={(e) => setRefFile(e.target.files[0])}
                    />

                    {!refFile ? (
                        <button
                            className="btn"
                            style={{ background: 'white', color: '#334155', border: '1px solid #cbd5e1' }}
                            onClick={() => document.getElementById('ref-upload').click()}
                        >
                            <FileUp size={16} style={{marginRight: '8px'}} /> Выбрать файл...
                        </button>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                            <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                📄 {refFile.name}
                            </div>
                            <button
                                className="btn"
                                disabled={uploadingRef}
                                onClick={handleUploadReference}
                                style={{ padding: '8px 15px', height: 'auto', display: 'flex', gap: '5px', background: '#10b981', border: 'none' }}
                            >
                                <Save size={16} /> {uploadingRef ? '...' : 'Сохранить'}
                            </button>
                            <button onClick={() => setRefFile(null)} style={{border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444'}}>
                                <X size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Блок просмотра текущего справочника */}
            <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
                <h4 style={{ marginTop: 0, marginBottom: '5px' }}>Просмотр базы</h4>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '15px' }}>
                   Открыть таблицу текущих сплитов для проверки данных.
                </p>
                <button
                    className="btn"
                    onClick={() => handleViewCurrentList()}
                    style={{ background: showTable ? '#e2e8f0' : 'white', color: '#334155', border: '1px solid #cbd5e1', display: 'flex', gap: '8px' }}
                >
                    {showTable ? <EyeOff size={18} /> : <Eye size={18} />}
                    {loadingView ? 'Загрузка...' : showTable ? 'Скрыть таблицу' : 'Открыть таблицу'}
                </button>
            </div>
        </div>

        {/* ТАБЛИЦА ПРОСМОТРА С ПОИСКОМ */}
        {showTable && viewData && (
            <div className="card" style={{ marginTop: '20px', overflow: 'hidden', padding: 0 }}>

                <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ fontWeight: 600, color: '#334155' }}>
                        Записей: {filteredData.length} <span style={{color: '#94a3b8', fontWeight: 400}}>(всего {viewData.length})</span>
                    </div>
                    <div style={{ position: 'relative', width: '250px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Поиск по справочнику..."
                            className="text-input"
                            style={{ marginBottom: 0, paddingLeft: '35px', height: '34px', fontSize: '13px' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                        <thead>
                            <tr style={{background: '#f1f5f9', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10}}>
                                {viewData.length > 0 && Object.keys(viewData[0]).map((key) => (
                                    <th key={key} style={{padding: '12px 15px', borderBottom: '2px solid #e2e8f0', color: '#475569'}}>{key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length > 0 ? (
                                filteredData.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        {Object.values(row).map((val, i) => (
                                            <td key={i} style={{padding: '10px 15px'}}>{val}</td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="100%" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                                        Ничего не найдено
                                    </td>
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
};

export default SplitsPage;