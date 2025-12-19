import React, { useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { UploadCloud, FileSpreadsheet, Play, CheckCircle2, ArrowRightLeft, List } from 'lucide-react';

// Мини-компонент для загрузки файла (упрощенный)
const SimpleFileBlock = ({ title, file, setFile, headers, setHeaders, selectedCol, setSelectedCol, color }) => {

    const handleFile = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        setFile(f);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
            if (data.length > 0) setHeaders(data[0]);
        };
        reader.readAsBinaryString(f);
    };

    return (
        <div className="card" style={{ flex: 1, minWidth: '300px', borderTop: `4px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <div style={{ background: color, padding: '8px', borderRadius: '8px', color: 'white' }}>
                    <FileSpreadsheet size={20} />
                </div>
                <h3 style={{ margin: 0 }}>{title}</h3>
            </div>

            {/* Загрузка */}
            <div style={{ marginBottom: '15px', border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '20px', textAlign: 'center', position: 'relative' }}>
                <input
        type="file"
        onChange={handleFile}
        accept=".xlsx, .xls, .csv"  // <--- ДОБАВИЛИ .csv
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
    />
                {file ? (
                    <div style={{ color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle2 size={18} /> {file.name}
                    </div>
                ) : (
                    <div style={{ color: '#94a3b8' }}>
                        <UploadCloud size={24} style={{ marginBottom: '5px' }} />
                        <div>Нажмите для выбора</div>
                    </div>
                )}
            </div>

            {/* Выбор колонки */}
            <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '5px', display: 'block' }}>
                    Колонка с инструментом
                </label>
                <select
                    className="text-input"
                    value={selectedCol}
                    onChange={e => setSelectedCol(e.target.value)}
                    disabled={!headers.length}
                >
                    <option value="">-- Выберите --</option>
                    {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
                </select>
                <div style={{fontSize: '11px', color: '#94a3b8', marginTop: '5px'}}>
                    {title === 'Unity' ? 'Например: [FU]XRP...' : 'Например: XRPUSDT'}
                </div>
            </div>
        </div>
    );
};

const InstrumentsPage = () => {
    const [file1, setFile1] = useState(null);
    const [headers1, setHeaders1] = useState([]);
    const [col1, setCol1] = useState('');

    const [file2, setFile2] = useState(null);
    const [headers2, setHeaders2] = useState([]);
    const [col2, setCol2] = useState('');

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [activeTab, setActiveTab] = useState('missing2'); // missing2 = есть в Unity, нет в АИС

    const handleCompare = async () => {
        if (!file1 || !file2 || !col1 || !col2) return toast.warning("Заполните все поля");

        setLoading(true);
        const formData = new FormData();
        formData.append('file1', file1);
        formData.append('file2', file2);
        formData.append('col1', col1);
        formData.append('col2', col2);

        try {
            const res = await axios.post('http://127.0.0.1:8000/api/compare-instruments', formData);
            setResult(res.data);
            toast.success("Готово!");
        } catch (e) {
            toast.error("Ошибка сервера");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ paddingRight: '20px', height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ marginBottom: '20px', fontSize: '24px' }}>Сверка Справочников (Инструменты)</h1>

            {/* СЕКЦИЯ ЗАГРУЗКИ */}
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px', flexShrink: 0 }}>
                <SimpleFileBlock
                    title="Unity"
                    color="#3b82f6"
                    file={file1} setFile={setFile1}
                    headers={headers1} setHeaders={setHeaders1}
                    selectedCol={col1} setSelectedCol={setCol1}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '50%' }}>
                        <ArrowRightLeft size={24} color="#94a3b8" />
                    </div>
                </div>

                <SimpleFileBlock
                    title="Провайдер"
                    color="#8b5cf6"
                    file={file2} setFile={setFile2}
                    headers={headers2} setHeaders={setHeaders2}
                    selectedCol={col2} setSelectedCol={setCol2}
                />
            </div>

            <div style={{ textAlign: 'center', marginBottom: '30px', flexShrink: 0 }}>
                <button
                    className="btn"
                    onClick={handleCompare}
                    disabled={loading}
                    style={{ padding: '12px 40px', fontSize: '16px', background: loading ? '#94a3b8' : '#10b981' }}
                >
                    {loading ? 'Обработка...' : <><Play size={20} style={{marginRight: 8}}/> Сравнить инструменты</>}
                </button>
            </div>

            {/* РЕЗУЛЬТАТЫ */}
            {result && (
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                    {/* Табы */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <button
                            onClick={() => setActiveTab('missing2')}
                            style={{
                                padding: '15px 20px', border: 'none', background: activeTab === 'missing2' ? 'white' : 'transparent',
                                borderBottom: activeTab === 'missing2' ? '2px solid #ef4444' : 'none',
                                fontWeight: 600, color: activeTab === 'missing2' ? '#ef4444' : '#64748b', cursor: 'pointer'
                            }}
                        >
                            Только в Unity
                            <span style={{ marginLeft: 8, background: '#fee2e2', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>
                                {result.stats.only_in_1}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('missing1')}
                            style={{
                                padding: '15px 20px', border: 'none', background: activeTab === 'missing1' ? 'white' : 'transparent',
                                borderBottom: activeTab === 'missing1' ? '2px solid #f59e0b' : 'none',
                                fontWeight: 600, color: activeTab === 'missing1' ? '#f59e0b' : '#64748b', cursor: 'pointer'
                            }}
                        >
                            Только в Провайдере
                            <span style={{ marginLeft: 8, background: '#fef3c7', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>
                                {result.stats.only_in_2}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('matches')}
                            style={{
                                padding: '15px 20px', border: 'none', background: activeTab === 'matches' ? 'white' : 'transparent',
                                borderBottom: activeTab === 'matches' ? '2px solid #16a34a' : 'none',
                                fontWeight: 600, color: activeTab === 'matches' ? '#16a34a' : '#64748b', cursor: 'pointer'
                            }}
                        >
                            Совпадения
                            <span style={{ marginLeft: 8, background: '#dcfce7', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>
                                {result.stats.matches}
                            </span>
                        </button>
                    </div>

                    {/* Список */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                                <tr>
                                    <th style={{ padding: '12px 20px', textAlign: 'left', color: '#64748b' }}>#</th>
                                    <th style={{ padding: '12px 20px', textAlign: 'left', color: '#64748b' }}>Инструмент (Тикер)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(activeTab === 'missing2' ? result.data.only_in_unity :
                                  activeTab === 'missing1' ? result.data.only_in_ais :
                                  result.data.matches
                                ).map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px 20px', width: '50px', color: '#94a3b8' }}>{idx + 1}</td>
                                        <td style={{ padding: '10px 20px', fontWeight: 600, color: '#334155' }}>{item}</td>
                                    </tr>
                                ))}
                                {((activeTab === 'missing2' ? result.data.only_in_unity :
                                   activeTab === 'missing1' ? result.data.only_in_ais :
                                   result.data.matches).length === 0) && (
                                    <tr>
                                        <td colSpan="2" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                            <List size={48} style={{ opacity: 0.2, marginBottom: 10 }} />
                                            <div>Список пуст</div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InstrumentsPage;