import React, { useState, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import {
    UploadCloud, FileSpreadsheet, Play, CheckCircle2,
    ArrowRightLeft, List, FileText, Copy, ClipboardCheck, Loader2, Info
} from 'lucide-react';

// --- CSS STYLES (Встроенные стили для анимаций и hover-эффектов) ---
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

// --- КОМПОНЕНТ ЗАГРУЗКИ ФАЙЛА ---
const SimpleFileBlock = ({ title, file, setFile, headers, setHeaders, selectedCol, setSelectedCol, color, showSelect = true, description }) => {
    const [isDragging, setIsDragging] = useState(false);

    const processFile = (f) => {
        if (!f) return;
        setFile(f);
        if (showSelect && setHeaders) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const wb = XLSX.read(evt.target.result, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                if (data.length > 0) setHeaders(data[0]);
            };
            reader.readAsBinaryString(f);
        }
    };

    const handleFile = (e) => processFile(e.target.files[0]);

    // Drag & Drop handlers
    const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        processFile(e.dataTransfer.files[0]);
    };

    return (
        <div className="card hover-card" style={{
            flex: 1, minWidth: '320px',
            borderTop: `4px solid ${color}`,
            background: 'white', borderRadius: '12px', padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div style={{ background: color, padding: '10px', borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileSpreadsheet size={20} />
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>{title}</h3>
                    {description && <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{description}</p>}
                </div>
            </div>

            {/* Зона Drag & Drop */}
            <div
                className={`drop-zone ${isDragging ? 'active' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                    marginBottom: '15px', borderRadius: '12px', padding: '25px',
                    textAlign: 'center', position: 'relative', cursor: 'pointer'
                }}
            >
                <input
                    type="file"
                    onChange={handleFile}
                    accept=".xlsx, .xls, .csv"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                />

                {file ? (
                    <div className="fade-in" style={{ color: '#16a34a', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={32} />
                        <span style={{ wordBreak: 'break-all' }}>{file.name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>Нажмите, чтобы заменить</span>
                    </div>
                ) : (
                    <div style={{ color: isDragging ? '#3b82f6' : '#94a3b8', transition: 'color 0.2s' }}>
                        <UploadCloud size={32} style={{ marginBottom: '8px' }} />
                        <div style={{ fontWeight: 500, fontSize: '14px' }}>
                            {isDragging ? 'Отпустите файл здесь' : 'Перетащите файл сюда'}
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.7 }}>или нажмите для выбора</div>
                    </div>
                )}
            </div>

            {/* Выбор колонки */}
            {showSelect && (
                <div className="fade-in">
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
                        🎯 Колонка поиска (Инструмент)
                    </label>
                    <div style={{ position: 'relative' }}>
                        <select
                            value={selectedCol}
                            onChange={e => setSelectedCol(e.target.value)}
                            disabled={!headers.length}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: '8px',
                                border: '1px solid #cbd5e1', background: headers.length ? 'white' : '#f1f5f9',
                                color: '#1e293b', fontSize: '14px', outline: 'none', cursor: 'pointer',
                                transition: 'border-color 0.2s'
                            }}
                        >
                            <option value="">{headers.length ? '-- Выберите колонку --' : 'Сначала загрузите файл'}</option>
                            {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- СРАВНЕНИЕ (View) ---
const ComparisonView = () => {
    const [file1, setFile1] = useState(null);
    const [headers1, setHeaders1] = useState([]);
    const [col1, setCol1] = useState('');

    const [file2, setFile2] = useState(null);
    const [headers2, setHeaders2] = useState([]);
    const [col2, setCol2] = useState('');

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [activeTab, setActiveTab] = useState('missing2');

    const handleCompare = async () => {
        if (!file1 || !file2 || !col1 || !col2) return toast.warning("Пожалуйста, загрузите оба файла и выберите колонки.");

        setLoading(true);
        const formData = new FormData();
        formData.append('file1', file1);
        formData.append('file2', file2);
        formData.append('col1', col1);
        formData.append('col2', col2);

        try {
            const res = await axios.post('/api/compare-instruments', formData);
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
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '25px', flexShrink: 0 }}>
                <SimpleFileBlock
                    title="Unity"
                    description="Основной справочник"
                    color="#3b82f6"
                    file={file1} setFile={setFile1}
                    headers={headers1} setHeaders={setHeaders1}
                    selectedCol={col1} setSelectedCol={setCol1}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '50%', color: '#94a3b8' }}>
                        <ArrowRightLeft size={24} />
                    </div>
                </div>

                <SimpleFileBlock
                    title="Провайдер"
                    description="Внешний файл для сверки"
                    color="#8b5cf6"
                    file={file2} setFile={setFile2}
                    headers={headers2} setHeaders={setHeaders2}
                    selectedCol={col2} setSelectedCol={setCol2}
                />
            </div>

            <div style={{ textAlign: 'center', marginBottom: '30px', flexShrink: 0 }}>
                <button
                    className="custom-btn"
                    onClick={handleCompare}
                    disabled={loading}
                    style={{
                        padding: '14px 40px', fontSize: '16px', fontWeight: 600,
                        background: loading ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white', border: 'none', borderRadius: '50px',
                        boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '10px'
                    }}
                >
                    {loading ? <Loader2 className="spin" size={20} /> : <Play size={20} fill="currentColor" />}
                    {loading ? 'Обработка данных...' : 'Начать сверку'}
                </button>
            </div>

            {result && (
                <div className="card fade-in" style={{
                    flex: 1, display: 'flex', flexDirection: 'column', padding: 0,
                    overflow: 'hidden', background: 'white', borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 10px' }}>
                        <TabButton
                            active={activeTab === 'missing2'}
                            onClick={() => setActiveTab('missing2')}
                            color="#ef4444"
                            label="Только в Unity"
                            count={result.stats.only_in_1}
                        />
                        <TabButton
                            active={activeTab === 'missing1'}
                            onClick={() => setActiveTab('missing1')}
                            color="#f59e0b"
                            label="Только у Провайдера"
                            count={result.stats.only_in_2}
                        />
                        <TabButton
                            active={activeTab === 'matches'}
                            onClick={() => setActiveTab('matches')}
                            color="#16a34a"
                            label="Совпадения"
                            count={result.stats.matches}
                        />
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 10 }}>
                                <tr>
                                    <th style={{ padding: '15px 24px', textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>#</th>
                                    <th style={{ padding: '15px 24px', textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Инструмент (Тикер)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const data = activeTab === 'missing2' ? result.data.only_in_unity :
                                                 activeTab === 'missing1' ? result.data.only_in_ais :
                                                 result.data.matches;

                                    if (data.length === 0) return (
                                        <tr>
                                            <td colSpan="2" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                                <List size={48} style={{ opacity: 0.2, marginBottom: 15 }} />
                                                <div style={{ fontSize: '16px' }}>Список пуст</div>
                                            </td>
                                        </tr>
                                    );

                                    return data.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ padding: '12px 24px', width: '60px', color: '#94a3b8', fontSize: '13px' }}>{idx + 1}</td>
                                            <td style={{ padding: '12px 24px', fontWeight: 500, color: '#334155' }}>{item}</td>
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

// --- ГЕНЕРАТОР ОТЧЕТА (View) ---
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
        formData.append('file', file);

        try {
            const res = await axios.post('/api/tools/generate-trade-report', formData);
            if(res.data.status === 'success') {
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
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '900px', margin: '0 auto', width: '100%' }}>

            <div style={{ marginBottom: '30px' }}>
                <div style={{
                    background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '15px 20px',
                    marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'start'
                }}>
                    <Info size={20} color="#3b82f6" style={{ marginTop: '2px' }}/>
                    <div style={{ fontSize: '14px', color: '#1e40af', lineHeight: '1.5' }}>
                        <strong>Как это работает:</strong> Загрузите Excel файл.
                        Система ищет колонки <code>Instrument</code>, <code>Amount</code>, <code>Quote amount</code>.
                        Сделки группируются, и формируется текстовое описание для отчета.
                    </div>
                </div>

                <SimpleFileBlock
                    title="Файл со сделками"
                    description="Excel (.xlsx) или CSV"
                    color="#f59e0b"
                    file={file} setFile={setFile}
                    showSelect={false}
                />
            </div>

            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <button
                    className="custom-btn"
                    onClick={handleGenerate}
                    disabled={loading}
                    style={{
                        padding: '14px 40px', fontSize: '16px', fontWeight: 600,
                        background: loading ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: 'white', border: 'none', borderRadius: '50px',
                        boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.3)',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '10px'
                    }}
                >
                    {loading ? <Loader2 className="spin" size={20} /> : <FileText size={20} />}
                    {loading ? 'Генерация...' : 'Создать отчет'}
                </button>
            </div>

            {reportText && (
                <div className="fade-in" style={{
                    flex: 1, padding: '25px', display: 'flex', flexDirection: 'column',
                    background: 'white', borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #e2e8f0', minHeight: '300px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #f1f5f9' }}>
                        <h3 style={{ margin: 0, color: '#1e293b' }}>Результат генерации:</h3>
                        <button
                            className="custom-btn"
                            onClick={copyToClipboard}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                border: `1px solid ${copied ? '#16a34a' : '#cbd5e1'}`,
                                background: copied ? '#dcfce7' : 'white',
                                padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                                color: copied ? '#15803d' : '#475569',
                                fontWeight: 500, fontSize: '14px'
                            }}
                        >
                            {copied ? <ClipboardCheck size={16}/> : <Copy size={16}/>}
                            {copied ? 'Скопировано!' : 'Копировать текст'}
                        </button>
                    </div>

                    <textarea
                        readOnly
                        value={reportText}
                        style={{
                            flex: 1, width: '100%',
                            padding: '20px', borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                            fontSize: '13px', lineHeight: '1.6',
                            resize: 'none', outline: 'none',
                            background: '#f8fafc', color: '#334155'
                        }}
                    />
                </div>
            )}
        </div>
    );
};

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---

const TabButton = ({ active, onClick, color, label, count }) => (
    <button
        onClick={onClick}
        style={{
            padding: '16px 10px',
            border: 'none',
            background: 'transparent',
            borderBottom: active ? `3px solid ${color}` : '3px solid transparent',
            fontWeight: active ? 700 : 500,
            color: active ? color : '#64748b',
            cursor: 'pointer',
            flex: 1,
            textAlign: 'center',
            transition: 'all 0.2s',
            fontSize: '14px'
        }}
    >
        {label}
        <span style={{
            marginLeft: 8,
            background: active ? color : '#e2e8f0',
            color: active ? 'white' : '#64748b',
            padding: '2px 8px',
            borderRadius: '20px',
            fontSize: '11px',
            verticalAlign: 'middle'
        }}>
            {count}
        </span>
    </button>
);

const NavButton = ({ active, onClick, icon: Icon, label }) => (
    <button
        className="custom-btn"
        onClick={onClick}
        style={{
            padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
            background: active ? 'white' : 'transparent',
            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            color: active ? '#0f172a' : '#64748b',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.2s'
        }}
    >
        <Icon size={16} />
        {label}
    </button>
);

// --- ГЛАВНЫЙ КОМПОНЕНТ СТРАНИЦЫ ---
const InstrumentsPage = () => {
    const [viewMode, setViewMode] = useState('compare');

    return (
        <>
            <style>{styles + ` .spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } `}</style>

            <div style={{
                padding: '20px 40px',
                height: 'calc(100vh - 60px)',
                display: 'flex',
                flexDirection: 'column',
                background: '#f1f5f9', // Светло-серый фон для всей страницы
                borderRadius: '16px 0 0 16px' // Небольшое скругление, если это часть сайдбара
            }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <div>
                        <h1 style={{ fontSize: '28px', margin: '0 0 5px 0', color: '#0f172a', fontWeight: 700 }}>Инструменты</h1>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Управление справочниками и генерация отчетов</p>
                    </div>

                    {/* Переключатель режимов */}
                    <div style={{ background: '#e2e8f0', padding: '4px', borderRadius: '10px', display: 'flex', gap: '4px' }}>
                        <NavButton
                            active={viewMode === 'compare'}
                            onClick={() => setViewMode('compare')}
                            icon={ArrowRightLeft}
                            label="Сверка Инструментов"
                        />
                        <NavButton
                            active={viewMode === 'report'}
                            onClick={() => setViewMode('report')}
                            icon={FileText}
                            label="Генератор отчетов VISION"
                        />
                    </div>
                </div>

                {/* Контент */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {viewMode === 'compare' ? <ComparisonView /> : <ReportView />}
                </div>
            </div>
        </>
    );
};

export default InstrumentsPage;