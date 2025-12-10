// frontend/src/pages/SplitsPage.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { Layers, AlertCircle, CheckCircle, Upload, FileSpreadsheet, X } from 'lucide-react';

const SplitsPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCheck = async () => {
    if (!file) {
      alert("Пожалуйста, выберите файл для проверки (Ежедневный АИС).");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append('daily_file', file);

    try {
        const settingsRes = await axios.get('http://127.0.0.1:8000/api/settings');
        formData.append('settings_json', JSON.stringify(settingsRes.data));

        const res = await axios.post('http://127.0.0.1:8000/api/check-splits', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (res.data.status === 'error') {
            setError(res.data.message);
        } else {
            setResult(res.data);
        }

    } catch (err) {
        console.error(err);
        setError(err.response?.data?.detail || "Ошибка соединения с сервером");
    } finally {
        setLoading(false);
    }
  };

  // Функция для сброса файла
  const clearFile = (e) => {
    e.stopPropagation(); // Чтобы не открывалось окно выбора файла
    setFile(null);
    setResult(null);
  };

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
         Проверка Сплитов
      </h1>

      {/* КРАСИВАЯ КАРТОЧКА ЗАГРУЗКИ */}
      <div className="card" style={{ padding: '30px' }}>

        {/* Заголовок карточки */}
        <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={24} color="#3b82f6" />
                Загрузка файла сверки
            </h3>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#64748b' }}>
                Загрузите ежедневный файл (АИС). Список сплитов берется автоматически из настроек.
            </p>
        </div>

        {/* --- ЗОНА ЗАГРУЗКИ ФАЙЛА (САМОЕ ВАЖНОЕ) --- */}
        <div
            style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: file ? '#f0f9ff' : '#f8fafc',
                transition: 'all 0.2s ease',
                position: 'relative'
            }}
            onClick={() => document.getElementById('split-file-upload').click()}
            onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
        >
            <input
                id="split-file-upload"
                type="file"
                accept=".xlsx, .xls"
                hidden
                onChange={e => setFile(e.target.files[0])}
            />

            {!file ? (
                // СОСТОЯНИЕ: ФАЙЛ НЕ ВЫБРАН
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: '#e0f2fe', padding: '15px', borderRadius: '50%' }}>
                        <Upload size={30} color="#3b82f6" />
                    </div>
                    <div>
                        <span style={{ color: '#3b82f6', fontWeight: 600 }}>Нажмите, чтобы загрузить</span>
                        <br />
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>или перетащите файл сюда (Excel)</span>
                    </div>
                </div>
            ) : (
                // СОСТОЯНИЕ: ФАЙЛ ВЫБРАН
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
                    <FileSpreadsheet size={40} color="#10b981" />
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{file.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                            {(file.size / 1024).toFixed(1)} KB • Готов к проверке
                        </div>
                    </div>
                    {/* Кнопка удаления файла */}
                    <button
                        onClick={clearFile}
                        style={{
                            background: 'white', border: '1px solid #e2e8f0',
                            borderRadius: '50%', width: '30px', height: '30px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', marginLeft: '20px'
                        }}
                        title="Удалить файл"
                    >
                        <X size={16} color="#ef4444" />
                    </button>
                </div>
            )}
        </div>

        {/* КНОПКА ДЕЙСТВИЯ */}
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
                className="btn"
                onClick={handleCheck}
                disabled={loading || !file}
                style={{
                    height: '45px',
                    padding: '0 30px',
                    opacity: (!file || loading) ? 0.6 : 1
                }}
            >
                {loading ? 'Идет анализ...' : 'Проверить на сплиты'}
            </button>
        </div>
      </div>

      {/* БЛОК ОШИБОК */}
      {error && (
        <div className="card" style={{borderLeft: '5px solid #ef4444', backgroundColor: '#fef2f2', marginTop: '20px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#b91c1c'}}>
                <AlertCircle />
                <h3 style={{margin: 0}}>Ошибка</h3>
            </div>
            <p style={{ margin: '10px 0' }}>{error}</p>
        </div>
      )}

      {/* БЛОК РЕЗУЛЬТАТОВ */}
      {result && (
        <div className="card" style={{
            marginTop: '20px',
            borderLeft: result.data.length > 0 ? '5px solid #eab308' : '5px solid #10b981'
        }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px'}}>
                {result.data.length > 0 ? <AlertCircle color="#eab308" size={28} /> : <CheckCircle color="#10b981" size={28} />}
                <div>
                    <h3 style={{margin: 0}}>
                        {result.data.length > 0
                            ? `Найдено сплитов: ${result.data.length}`
                            : "Сплитов не обнаружено"}
                    </h3>
                    <p style={{margin: '2px 0 0 0', fontSize: '13px', color: '#64748b'}}>
                        {result.data.length > 0
                            ? "Ниже список позиций, требующих внимания"
                            : "Все позиции соответствуют справочнику"}
                    </p>
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
    </div>
  );
};

export default SplitsPage;