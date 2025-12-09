// frontend/src/pages/SplitsPage.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { Layers, AlertCircle, CheckCircle } from 'lucide-react';

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
    // Для этого эндпоинта нам не нужен файл сплитов, если он задан в настройках,
    // но сервер требует отправку поля 'split_file' как заглушку или реальный файл.
    // Чтобы не ломать логику сервера, мы отправим settings_json, как он ожидает.

    // ВАЖНО: В main.py мы сделали endpoint, который ждет 'daily_file' и 'settings_json'.
    // Файл сплитов сервер прочитает по пути из настроек.

    try {
        // 1. Сначала получаем текущие настройки
        const settingsRes = await axios.get('http://127.0.0.1:8000/api/settings');
        formData.append('settings_json', JSON.stringify(settingsRes.data));

        // 2. Отправляем запрос
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

  return (
    <div>
      <h1>Проверка Сплитов</h1>

      {/* КАРТОЧКА ЗАГРУЗКИ */}
      <div className="card">
        <div style={{display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px'}}>
            <Layers size={32} color="#3b82f6" />
            <div>
                <h3 style={{margin: 0}}>Загрузка файла сверки</h3>
                <p style={{margin: '5px 0 0 0', fontSize: '14px', color: '#666'}}>
                    Загрузите ежедневный файл (АИС). Список сплитов берется из пути в Настройках.
                </p>
            </div>
        </div>

        <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
            <input
                type="file"
                onChange={e => setFile(e.target.files[0])}
                className="input-group"
                style={{marginBottom: 0, flex: 1}}
            />
            <button className="btn" onClick={handleCheck} disabled={loading} style={{height: '42px'}}>
                {loading ? 'Проверка...' : 'Проверить на сплиты'}
            </button>
        </div>
      </div>

      {/* БЛОК ОШИБОК */}
      {error && (
        <div className="card" style={{borderLeft: '5px solid #ef4444', backgroundColor: '#fef2f2'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#b91c1c'}}>
                <AlertCircle />
                <h3>Ошибка</h3>
            </div>
            <p>{error}</p>
            <p style={{fontSize: '13px', color: '#666'}}>
                Совет: Проверьте в "Настройках", что путь к файлу сплитов указан верно и файл существует.
            </p>
        </div>
      )}

      {/* БЛОК РЕЗУЛЬТАТОВ */}
      {result && (
        <div className="card" style={{borderLeft: result.data.length > 0 ? '5px solid #eab308' : '5px solid #10b981'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px'}}>
                {result.data.length > 0 ? <AlertCircle color="#eab308" /> : <CheckCircle color="#10b981" />}
                <h3 style={{margin: 0}}>
                    {result.data.length > 0
                        ? `Обнаружено сплитов: ${result.data.length}`
                        : "Сплитов не обнаружено"}
                </h3>
            </div>

            {result.data.length > 0 && (
                <div style={{overflowX: 'auto'}}>
                    <table border="1" style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px'}}>
                        <thead>
                            <tr style={{background: '#f1f5f9'}}>
                                <th style={{padding: '8px'}}>ISIN</th>
                                <th style={{padding: '8px'}}>Счет</th>
                                <th style={{padding: '8px'}}>Количество</th>
                                <th style={{padding: '8px'}}>Полное название ЦБ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.data.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{padding: '8px'}}>{row['ISIN']}</td>
                                    <td style={{padding: '8px'}}>{row['Счет']}</td>
                                    <td style={{padding: '8px'}}>{row['Количество']}</td>
                                    <td style={{padding: '8px'}}>{row['Полное название ЦБ']}</td>
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