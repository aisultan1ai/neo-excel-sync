import React, { useState, useEffect } from 'react';
import axios from 'axios';
// import SmartTable from '../components/SmartTable';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx'; // Библиотека для чтения Excel
import {
  UploadCloud, FileSpreadsheet, Play, Download,
  CheckCircle2, FileText, Settings2, RefreshCcw, AlertCircle
} from 'lucide-react';


// --- КОМПОНЕНТ КАРТОЧКИ ФАЙЛА ---
const FileSection = ({
    title, file, setFile,
    headers,
    idCol, setIdCol,
    accCol, setAccCol,
    color,
    defaultIdName, defaultAccName
}) => {

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    // Читаем заголовки файла для авто-выбора
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data && data.length > 0) {
                const foundHeaders = data[0];
                if (headers.onLoad) headers.onLoad(foundHeaders);

                // --- СТРОГИЙ АВТО-ПОИСК ---
                // Ищем только если заголовок содержит точное ключевое слово из настроек
                if (defaultIdName) {
                    const foundId = foundHeaders.find(h =>
                        h.toLowerCase().trim().includes(defaultIdName.toLowerCase().trim())
                    );
                    if (foundId) setIdCol(foundId);
                }

                // Для счета оставляем гибкость (Account или Счет), так как они часто меняются,
                // либо используем настройку по умолчанию, если она есть.
                const foundAcc = foundHeaders.find(h =>
                    (defaultAccName && h.toLowerCase().includes(defaultAccName.toLowerCase())) ||
                    h.toLowerCase().includes("account") ||
                    h.toLowerCase().includes("счет")
                );
                if (foundAcc) setAccCol(foundAcc);
            }
        } catch (e) {
            console.error("Ошибка чтения заголовков", e);
        }
    };
    reader.readAsBinaryString(selectedFile);
  };

  return (
    // gap: 12px убирает большой разрыв между файлом и настройками
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '350px'}}>

      {/* Заголовок */}
      <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
        <div style={{background: color, padding: '10px', borderRadius: '10px', color: 'white', boxShadow: `0 4px 10px ${color}40`}}>
            <FileSpreadsheet size={24} />
        </div>
        <h3 style={{margin: 0, fontSize: '18px', fontWeight: 600, color: '#1e293b'}}>{title}</h3>
      </div>

      {/* Зона загрузки */}
      {/* minHeight: auto когда файл есть, чтобы блок схлопнулся */}
      <div style={{position: 'relative', minHeight: file ? 'auto' : '160px', transition: 'min-height 0.3s'}}>
         <input
          type="file"
          className="file-input-hidden"
          style={{zIndex: file ? 1 : 10}}
          onChange={handleFileSelect}
          accept=".xlsx, .xls, .csv"
        />

        {file ? (
          <div className="uploaded-file-card" style={{marginTop: '0'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
              <CheckCircle2 size={32} color="#16a34a" />
              <div style={{overflow: 'hidden'}}>
                 <div style={{fontWeight: 600, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px'}}>
                   {file.name}
                 </div>
                 <div style={{fontSize: '12px', color: '#64748b'}}>
                   {(file.size / 1024).toFixed(1)} KB
                 </div>
              </div>
            </div>
            <label style={{cursor: 'pointer', padding: '5px', borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'}}>
                <RefreshCcw size={16} color="#64748b" />
                <input type="file" style={{display:'none'}} onChange={handleFileSelect} accept=".xlsx, .xls, .csv"/>
            </label>
          </div>
        ) : (
          <div className="file-upload-area" style={{height: '100%', position: 'absolute', width: '100%', top: 0}}>
              <UploadCloud size={32} color="#94a3b8" style={{marginBottom: '10px'}}/>
              <div style={{textAlign: 'center'}}>
                <span style={{color: '#3b82f6', fontWeight: 600, fontSize: '16px'}}>Выберите файл</span>
                <span style={{display: 'block', fontSize: '13px', color: '#94a3b8', marginTop: '4px'}}>
                  или перетащите сюда
                </span>
              </div>
          </div>
        )}
      </div>

      {/* Настройки (Выпадающие списки) */}
      <div style={{
          background: '#ffffff',
          padding: '15px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          opacity: file ? 1 : 0.6,
          pointerEvents: file ? 'all' : 'none',
          transition: 'all 0.3s'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#64748b', fontSize: '12px', fontWeight: 700}}>
            <Settings2 size={14} /> ВЫБОР СТОЛБЦОВ
        </div>

        <div className="input-group" style={{marginBottom: '10px'}}>
            <label className="input-label" style={{fontSize: '13px', color: '#475569'}}>
                Уникальный ID сделки
            </label>
            <select
                className="text-input"
                value={idCol}
                onChange={e => setIdCol(e.target.value)}
                style={{cursor: 'pointer', appearance: 'auto', padding: '8px'}}
            >
                <option value="">-- Выберите --</option>
                {headers.list && headers.list.map((h, i) => <option key={i} value={h}>{h}</option>)}
                {!headers.list?.includes(idCol) && idCol && <option value={idCol}>{idCol}</option>}
            </select>
        </div>

        <div className="input-group" style={{marginBottom: 0}}>
            <label className="input-label" style={{fontSize: '13px', color: '#475569'}}>
                Номер счета / Субсчет
            </label>
            <select
                className="text-input"
                value={accCol}
                onChange={e => setAccCol(e.target.value)}
                style={{cursor: 'pointer', appearance: 'auto', padding: '8px'}}
            >
                <option value="">-- Выберите --</option>
                {headers.list && headers.list.map((h, i) => <option key={i} value={h}>{h}</option>)}
                {!headers.list?.includes(accCol) && accCol && <option value={accCol}>{accCol}</option>}
            </select>
        </div>
      </div>
    </div>
  );
};

// --- ОСНОВНАЯ СТРАНИЦА ---
const SverkaPage = () => {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);

  // Храним список колонок для каждого файла
  const [headers1, setHeaders1] = useState([]);
  const [headers2, setHeaders2] = useState([]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('matches');

  // --- БЛОК ВОССТАНОВЛЕНИЯ ДАННЫХ ПРИ ОБНОВЛЕНИИ СТРАНИЦЫ ---
  useEffect(() => {
    const fetchLastResult = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/last-result');
        const data = await response.json();

        if (data.status === 'success') {
          console.log("Найдены сохраненные результаты, восстанавливаем...");

          // 1. Устанавливаем данные (замените setResults на ваше название переменной!)
          // Обычно это setResults или setReportData
          setResults(data);

          // 2. Если у вас есть переменная, отвечающая за шаг (например, шаг загрузки vs шаг результатов)
          // переключите её здесь. Например:
          // setActiveStep('results');
        }
      } catch (error) {
        console.error("Не удалось восстановить данные:", error);
      }
    };

    fetchLastResult();
  }, []); // Пустой массив [] гарантирует, что это сработает только 1 раз при входе на вкладку
  // ----------------------------------------------------------

  const [cols, setCols] = useState({
    id_col_1: '', acc_col_1: '',
    id_col_2: '', acc_col_2: ''
  });

  // Настройки по умолчанию (загружаются с сервера)
  const [defaults, setDefaults] = useState({
      id_unity: 'Execution ID', acc_unity: 'Account',
      id_ais: 'ID сделки', acc_ais: 'Субсчет'
  });

  useEffect(() => {
    // Получаем настройки с сервера, чтобы знать, какие колонки искать автоматически
    axios.get('http://127.0.0.1:8000/api/settings')
      .then(res => {
          if(res.data) {
             // Предполагаем, что в settings.json есть поля default_id_names
             // Берем первое значение из массива или конкретное поле
             // Здесь можно адаптировать под вашу структуру settings.json
             // Пока используем жестко заданные, если в JSON их нет
             setDefaults({
                 id_unity: 'Execution ID',
                 acc_unity: res.data.default_acc_name_unity || 'Account',
                 id_ais: 'ID сделки',
                 acc_ais: res.data.default_acc_name_ais || 'Субсчет'
             });
          }
      })
      .catch(() => toast.error("Сервер недоступен"));
  }, []);

  const handleCompare = async () => {
    if (!file1 || !file2) return toast.warning("Выберите оба файла!");
    if (!cols.id_col_1 || !cols.id_col_2) return toast.warning("Выберите колонки ID для обоих файлов!");

    setLoading(true);
    const formData = new FormData();
    formData.append('file1', file1);
    formData.append('file2', file2);

    try {
        const settingsRes = await axios.get('http://127.0.0.1:8000/api/settings');
        formData.append('settings_json', JSON.stringify(settingsRes.data));
    } catch (e) {
        setLoading(false);
        return toast.error("Ошибка настроек");
    }

    formData.append('id_col_1', cols.id_col_1);
    formData.append('acc_col_1', cols.acc_col_1);
    formData.append('id_col_2', cols.id_col_2);
    formData.append('acc_col_2', cols.acc_col_2);

    try {
      const res = await axios.post('http://127.0.0.1:8000/api/compare', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResults(res.data);
      toast.success("Готово!");
    } catch (error) {
        const msg = error.response?.data?.detail || error.message;
        toast.error("Ошибка: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!results) return;
    try {
        const res = await axios.post('http://127.0.0.1:8000/api/export', results, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Report_${new Date().toLocaleDateString()}.xlsx`);
        document.body.appendChild(link);
        link.click();
    } catch (error) { toast.error("Ошибка экспорта"); }
  };

  const ResultTable = ({ data }) => {
    if (!data || data.length === 0) return (
        <div style={{padding: '60px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px'}}>
          <FileText size={64} style={{opacity: 0.3, marginBottom: '20px'}} />
          <p style={{fontSize: '18px', fontWeight: 500}}>В этой категории данных нет</p>
        </div>
    );
    const headers = Object.keys(data[0]);
    return (
      <div className="result-table-wrapper" style={{maxHeight: '70vh', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}>
        <table className="styled-table">
          <thead>
            <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.slice(0, 500).map((row, i) => (
               <tr key={i}>{headers.map(h => <td key={h}>{String(row[h]===null?'':row[h])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column'}}>
      <h1 style={{marginBottom: '30px', fontSize: '28px', color: '#1e293b'}}>Сверка данных</h1>

      <div className="card" style={{padding: '30px', marginBottom: '30px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'}}>
        <div style={{display: 'flex', gap: '40px', flexWrap: 'wrap'}}>

            {/* ФАЙЛ 1 */}
            <FileSection
                title="Unity" color="#3b82f6"
                file={file1} setFile={setFile1}
                headers={{list: headers1, onLoad: setHeaders1}}

                // Значения
                idCol={cols.id_col_1} setIdCol={val => setCols(prev => ({...prev, id_col_1: val}))}
                accCol={cols.acc_col_1} setAccCol={val => setCols(prev => ({...prev, acc_col_1: val}))}

                // Строгий авто-выбор (Ищет Execution ID)
                defaultIdName={defaults.id_unity}
                defaultAccName={defaults.acc_unity}
            />

            {/* Разделитель */}
            <div style={{width: '1px', background: '#e2e8f0', margin: '10px 0'}}></div>

            {/* ФАЙЛ 2 */}
            <FileSection
                title="АИС" color="#8b5cf6"
                file={file2} setFile={setFile2}
                headers={{list: headers2, onLoad: setHeaders2}}

                // Значения
                idCol={cols.id_col_2} setIdCol={val => setCols(prev => ({...prev, id_col_2: val}))}
                accCol={cols.acc_col_2} setAccCol={val => setCols(prev => ({...prev, acc_col_2: val}))}

                // Строгий авто-выбор (Ищет ID сделки)
                defaultIdName={defaults.id_ais}
                defaultAccName={defaults.acc_ais}
            />
        </div>

        <div style={{marginTop: '40px', display: 'flex', justifyContent: 'center'}}>
            <button
                className="btn"
                onClick={handleCompare}
                disabled={loading}
                style={{
                    padding: '16px 60px',
                    fontSize: '18px',
                    fontWeight: 600,
                    borderRadius: '12px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.4)',
                    transition: 'transform 0.1s'
                }}
                onMouseDown={e => !loading && (e.currentTarget.style.transform = 'scale(0.98)')}
                onMouseUp={e => !loading && (e.currentTarget.style.transform = 'scale(1)')}
            >
                {loading ? 'Обработка...' : <><Play size={24} fill="white" /> Запустить сверку</>}
            </button>
        </div>
      </div>

      {/* РЕЗУЛЬТАТЫ */}
      {results && (
        <div className="card" style={{padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '500px'}}>
            <div style={{padding: '20px 30px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div className="tabs-container" style={{marginBottom: 0, borderBottom: 'none'}}>
                    {[
                        {id: 'matches', label: 'Совпадения', color: '#16a34a'},
                        {id: 'unmatched1', label: 'Расх. Unity', color: '#dc2626'},
                        {id: 'unmatched2', label: 'Расх. АИС', color: '#dc2626'},
                        {id: 'podft_7m_deals', label: 'ПОД/ФТ', color: '#ca8a04'},
                        {id: 'crypto_deals', label: 'Крипто', color: '#2563eb'},
                        {id: 'duplicates1', label: 'Дубли', color: '#ea580c'},
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            style={{fontSize: '15px', padding: '10px 15px'}}
                        >
                            {tab.label}
                            <span style={{
                                background: activeTab === tab.id ? tab.color : '#f1f5f9',
                                color: activeTab === tab.id ? 'white' : '#64748b',
                                padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '8px', fontWeight: 600
                            }}>
                                {results[tab.id]?.length || 0}
                            </span>
                        </button>
                    ))}
                </div>
                <button
                    className="btn" onClick={handleExport}
                    style={{background: '#10b981', padding: '10px 20px', fontSize: '14px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)'}}
                >
                    <Download size={18} style={{marginRight: '8px'}}/> Excel
                </button>
            </div>

            <div style={{flex: 1, background: '#ffffff'}}>
                <ResultTable data={results[activeTab]} />
            </div>
        </div>
      )}
    </div>
  );
};

export default SverkaPage;