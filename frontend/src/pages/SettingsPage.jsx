// frontend/src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Upload } from 'lucide-react'; // <-- Добавили Upload
import { toast } from 'react-toastify';

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/settings')
      .then(res => {
        setSettings(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Ошибка загрузки настроек:", err);
        toast.error("Ошибка загрузки настроек!");
        setLoading(false);
      });
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleArrayChange = (key, value) => {
    const array = value.split(',').map(item => item.trim());
    setSettings(prev => ({ ...prev, [key]: array }));
  };

  const handleOverlapChange = (e) => {
    const text = e.target.value;
    const array = text.split('\n').map(s => s.trim()).filter(s => s !== "");
    setSettings(prev => ({ ...prev, overlap_accounts: array }));
  };

  // --- НОВАЯ ФУНКЦИЯ ЗАГРУЗКИ ФАЙЛА СПЛИТОВ ---
  const handleSplitFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const toastId = toast.loading("Загрузка файла сплитов...");

    try {
        const res = await axios.post('http://127.0.0.1:8000/api/settings/upload-split-list', formData);

        // Сервер вернул новый путь, обновляем его в интерфейсе
        if (res.data.status === 'success') {
            handleChange('split_list_path', res.data.new_path);
            toast.update(toastId, { render: "Файл успешно загружен и привязан!", type: "success", isLoading: false, autoClose: 3000 });
        }
    } catch (error) {
        console.error(error);
        toast.update(toastId, { render: "Ошибка загрузки файла", type: "error", isLoading: false, autoClose: 3000 });
    }
  };
  // ---------------------------------------------

  const saveSettings = async () => {
    setSaving(true);
    try {
      await axios.post('http://127.0.0.1:8000/api/settings', settings);
      toast.success("Настройки успешно сохранены!");
    } catch (error) {
      console.error("Ошибка сохранения:", error);
      toast.error("Не удалось сохранить настройки.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{padding: 20}}>Загрузка настроек...</div>;
  if (!settings) return <div style={{padding: 20}}>Ошибка загрузки данных.</div>;

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
        <h1>Настройки</h1>
        <button className="btn" onClick={saveSettings} disabled={saving} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <Save size={18} />
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {/* БЛОК 1: ОБЩИЕ НАСТРОЙКИ */}
      <div className="card">
        <h3>📂 Столбцы по умолчанию</h3>
        <div className="input-group">
          <label className="input-label">Варианты названия столбца ID (через запятую)</label>
          <input
            className="text-input"
            value={settings.default_id_names.join(', ')}
            onChange={(e) => handleArrayChange('default_id_names', e.target.value)}
          />
        </div>
        <div style={{display: 'flex', gap: '20px'}}>
          <div className="input-group" style={{flex: 1}}>
            <label className="input-label">Счет в Unity</label>
            <input
              className="text-input"
              value={settings.default_acc_name_unity}
              onChange={(e) => handleChange('default_acc_name_unity', e.target.value)}
            />
          </div>
          <div className="input-group" style={{flex: 1}}>
            <label className="input-label">Счет в АИС</label>
            <input
              className="text-input"
              value={settings.default_acc_name_ais}
              onChange={(e) => handleChange('default_acc_name_ais', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* БЛОК 2: ПОД/ФТ (7М) */}
      <div className="card">
        <h3>🔍 ПОД/ФТ (7 000 000)</h3>
        <div style={{display: 'flex', gap: '20px'}}>
          <div className="input-group" style={{flex: 1}}>
            <label className="input-label">Колонка "Сумма"</label>
            <input
              className="text-input"
              value={settings.podft_sum_col}
              onChange={(e) => handleChange('podft_sum_col', e.target.value)}
            />
          </div>
          <div className="input-group" style={{flex: 1}}>
            <label className="input-label">Порог (сумма)</label>
            <input
              className="text-input"
              value={settings.podft_threshold}
              onChange={(e) => handleChange('podft_threshold', e.target.value)}
            />
          </div>
        </div>

        <div style={{marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px'}}>
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '10px'}}>
            <input
              type="checkbox"
              checked={settings.podft_filter_enabled}
              onChange={() => handleToggle('podft_filter_enabled')}
              style={{marginRight: '10px'}}
            />
            <strong>Включить фильтр-исключение</strong>
          </label>

          {settings.podft_filter_enabled && (
            <div style={{paddingLeft: '20px', background: '#f8fafc', padding: '10px', borderRadius: '5px'}}>
               <div className="input-group">
                <label className="input-label">Колонка для фильтра</label>
                <input
                  className="text-input"
                  value={settings.podft_filter_col}
                  onChange={(e) => handleChange('podft_filter_col', e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Значения для исключения (через запятую)</label>
                <input
                  className="text-input"
                  value={settings.podft_filter_values}
                  onChange={(e) => handleChange('podft_filter_values', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* БЛОК 3: БОНДЫ И ОПЦИОНЫ (45М) */}
      <div className="card">
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <h3>📈 Бонды и Опционы (45 000 000)</h3>
            <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer'}}>
                <input
                type="checkbox"
                checked={settings.bo_enabled}
                onChange={() => handleToggle('bo_enabled')}
                style={{marginRight: '10px'}}
                />
                Включено
            </label>
        </div>

        {settings.bo_enabled && (
            <div style={{marginTop: '10px'}}>
                <div style={{display: 'flex', gap: '20px'}}>
                    <div className="input-group" style={{flex: 1}}>
                        <label className="input-label">Колонка "Instrument" (Unity)</label>
                        <input className="text-input" value={settings.bo_unity_instrument_col} onChange={(e) => handleChange('bo_unity_instrument_col', e.target.value)} />
                    </div>
                    <div className="input-group" style={{flex: 1}}>
                        <label className="input-label">Колонка "Сумма" (АИС)</label>
                        <input className="text-input" value={settings.bo_ais_sum_col} onChange={(e) => handleChange('bo_ais_sum_col', e.target.value)} />
                    </div>
                </div>
                <div style={{display: 'flex', gap: '20px'}}>
                    <div className="input-group" style={{flex: 1}}>
                        <label className="input-label">Порог</label>
                        <input className="text-input" value={settings.bo_threshold} onChange={(e) => handleChange('bo_threshold', e.target.value)} />
                    </div>
                    <div className="input-group" style={{flex: 1}}>
                        <label className="input-label">Префиксы (через запятую)</label>
                        <input className="text-input" value={settings.bo_prefixes} onChange={(e) => handleChange('bo_prefixes', e.target.value)} />
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* БЛОК 4: СПЛИТЫ (ОБНОВЛЕННЫЙ) */}
      <div className="card">
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <h3>🧩 Настройки Сплитов</h3>
            <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer'}}>
                <input
                type="checkbox"
                checked={settings.split_check_enabled}
                onChange={() => handleToggle('split_check_enabled')}
                style={{marginRight: '10px'}}
                />
                Включено
            </label>
        </div>

        {settings.split_check_enabled && (
            <div style={{marginTop: '10px'}}>
                {/* Новое поле выбора файла */}
                <div className="input-group">
                    <label className="input-label">Справочник сплитов (Excel)</label>
                    <div style={{display: 'flex', gap: '10px'}}>
                        <input
                            className="text-input"
                            value={settings.split_list_path || "Файл не выбран"}
                            readOnly // Запрещаем ручное редактирование, только через загрузку
                            style={{backgroundColor: '#f9f9f9', color: '#555'}}
                        />
                        <label className="btn" style={{cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap'}}>
                            <Upload size={16} />
                            Загрузить
                            <input
                                type="file"
                                hidden
                                accept=".xlsx, .xls"
                                onChange={handleSplitFileSelect}
                            />
                        </label>
                    </div>
                    <small style={{color: '#888'}}>Загрузите файл со списком сплитов. Путь обновится автоматически.</small>
                </div>

                <div style={{display: 'flex', gap: '20px', marginTop: '10px'}}>
                    <div className="input-group" style={{flex: 1}}>
                        <label className="input-label">Столбец ISIN (в списке сплитов)</label>
                        <input className="text-input" value={settings.split_list_isin_col} onChange={(e) => handleChange('split_list_isin_col', e.target.value)} />
                    </div>
                    <div className="input-group" style={{flex: 1}}>
                        <label className="input-label">Столбец ЦБ (в файле сверки)</label>
                        <input className="text-input" value={settings.daily_file_security_col} onChange={(e) => handleChange('daily_file_security_col', e.target.value)} />
                    </div>
                     <div className="input-group" style={{flex: 1}}>
                        <label className="input-label">Столбец Кол-во (в файле сверки)</label>
                        <input className="text-input" value={settings.split_daily_qty_col} onChange={(e) => handleChange('split_daily_qty_col', e.target.value)} />
                    </div>
                </div>
            </div>
        )}
      </div>

       {/* БЛОК 5: СЧЕТА ПЕРЕКРЫТИЯ */}
       <div className="card">
        <h3>🚫 Счета перекрытия</h3>
        <p style={{fontSize: '12px', color: '#666', marginBottom: '5px'}}>Введите номера счетов, каждый с новой строки</p>
        <textarea
            className="text-input"
            style={{height: '150px', fontFamily: 'monospace'}}
            value={settings.overlap_accounts ? settings.overlap_accounts.join('\n') : ''}
            onChange={handleOverlapChange}
        />
       </div>

       <div style={{height: '50px'}}></div>
    </div>
  );
};

export default SettingsPage;