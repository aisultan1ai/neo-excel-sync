import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Save, LogOut, Settings, Shield,
  TrendingUp, Layers, Database, User, Key, Upload, Lock
} from 'lucide-react';
import { toast } from 'react-toastify';

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  // --- PERMISSIONS STATE ---
  const [canEdit, setCanEdit] = useState(false);
  const [userRole, setUserRole] = useState("");

  // --- INITIAL DATA LOADING ---
  useEffect(() => {
    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const [settingsRes, profileRes] = await Promise.all([
                axios.get('/api/settings'),
                axios.get('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            setSettings(settingsRes.data);

            // Check Permissions
            const { department, is_admin } = profileRes.data;
            const hasAccess = department === 'Back Office' || is_admin;
            setCanEdit(hasAccess);
            setUserRole(is_admin ? "Admin" : department);

            setLoading(false);
        } catch (err) {
            console.error("Error loading data:", err);
            toast.error("Ошибка загрузки данных");
            setLoading(false);
        }
    };
    fetchData();
  }, []);

  // --- HANDLERS ---
  const handleChange = (key, value) => {
      if (!canEdit) return; // Guard clause
      setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleToggle = (key) => {
      if (!canEdit) return; // Guard clause
      setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleArrayChange = (key, value) => {
    if (!canEdit) return;
    const array = value.split(',').map(item => item.trim());
    setSettings(prev => ({ ...prev, [key]: array }));
  };

  const handleOverlapChange = (e) => {
    if (!canEdit) return;
    const text = e.target.value;
    const array = text.split('\n').map(s => s.trim()).filter(s => s !== "");
    setSettings(prev => ({ ...prev, overlap_accounts: array }));
  };

  const handleSplitFileSelect = async (e) => {
    if (!canEdit) return;
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const toastId = toast.loading("Загрузка...");
    try {
        const res = await axios.post('/api/settings/upload-split-list', formData);
        // Direct state update is fine here since it comes from server response
        setSettings(prev => ({ ...prev, split_list_path: res.data.new_path }));
        toast.update(toastId, { render: "Файл обновлен", type: "success", isLoading: false, autoClose: 2000 });
    } catch (error) {
        toast.update(toastId, { render: "Ошибка", type: "error", isLoading: false, autoClose: 2000 });
    }
  };

  const saveSettings = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await axios.post('/api/settings', settings);
      toast.success("Настройки сохранены");
    } catch (error) {
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{padding: 50, textAlign: 'center', color: '#64748b'}}>Загрузка параметров...</div>;

  const tabs = [
    { id: 'general', label: 'Общие', icon: Settings },
    { id: 'podft', label: 'ПОД/ФТ', icon: Shield },
    { id: 'crypto', label: 'Крипто', icon: Key },
    { id: 'bonds', label: 'Бонды', icon: TrendingUp },
    { id: 'splits', label: 'Сплиты', icon: Layers },
    { id: 'database', label: 'Исключения', icon: Database },
  ];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '60px' }}>

      <div style={{ marginBottom: '25px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
        <div>
            <h1 style={{ fontSize: '32px', margin: '0 0 10px 0', color: '#1e293b' }}>Настройки</h1>
            <p style={{ color: '#64748b', margin: 0 }}>Управление параметрами системы</p>
        </div>
        {!canEdit && (
            <div style={{background: '#fef2f2', color: '#ef4444', padding: '8px 15px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #fecaca'}}>
                <Lock size={16} />
                <span>Только чтение ({userRole})</span>
            </div>
        )}
      </div>

      {/* ГОРИЗОНТАЛЬНЫЕ ВКЛАДКИ */}
      <div style={{
          display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px', marginBottom: '25px',
          justifyContent: 'center', flexWrap: 'wrap'
      }}>
        {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 18px', borderRadius: '25px', border: '1px solid',
                        borderColor: isActive ? (tab.danger ? '#ef4444' : '#3b82f6') : '#e2e8f0',
                        background: isActive ? (tab.danger ? '#ef4444' : '#3b82f6') : 'white',
                        color: isActive ? 'white' : '#64748b',
                        fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                        transition: 'all 0.2s ease', boxShadow: isActive ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    <Icon size={16} /> {tab.label}
                </button>
            )
        })}
      </div>

      {/* --- ОБЛАСТЬ КОНТЕНТА --- */}
      <div className="card" style={{ padding: '40px', minHeight: '300px', borderTop: '4px solid #3b82f6', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)' }}>

        {/* 1. ОБЩИЕ */}
        {activeTab === 'general' && (
            <div className="fade-in">
                <h3 style={{marginTop: 0, marginBottom: '25px'}}>Основные параметры</h3>

                <div className="input-group">
                    <label className="input-label">Варианты названия столбца ID</label>
                    <input className="text-input" disabled={!canEdit} value={settings.default_id_names.join(', ')} onChange={(e) => handleArrayChange('default_id_names', e.target.value)} />
                    <div className="hint">Используются для автоматического поиска ID сделки</div>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                    <div className="input-group">
                        <label className="input-label">Счет в Unity</label>
                        <input className="text-input" disabled={!canEdit} value={settings.default_acc_name_unity} onChange={(e) => handleChange('default_acc_name_unity', e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Счет в АИС</label>
                        <input className="text-input" disabled={!canEdit} value={settings.default_acc_name_ais} onChange={(e) => handleChange('default_acc_name_ais', e.target.value)} />
                    </div>
                </div>
            </div>
        )}

        {/* 2. ПОД/ФТ */}
        {activeTab === 'podft' && (
            <div className="fade-in">
                <h3 style={{marginTop: 0, marginBottom: '25px'}}>Финансовый мониторинг (ПОД/ФТ)</h3>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                    <div className="input-group">
                        <label className="input-label">Колонка "Сумма"</label>
                        <input className="text-input" disabled={!canEdit} value={settings.podft_sum_col} onChange={(e) => handleChange('podft_sum_col', e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Порог (KZT)</label>
                        <input className="text-input" disabled={!canEdit} value={settings.podft_threshold} onChange={(e) => handleChange('podft_threshold', e.target.value)} />
                    </div>
                </div>

                <div style={{ marginTop: '20px', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <span style={{fontWeight: 600, color: '#334155'}}>Фильтр исключений</span>
                        <label className="switch">
                            <input type="checkbox" disabled={!canEdit} checked={settings.podft_filter_enabled} onChange={() => handleToggle('podft_filter_enabled')} />
                            <span className={`slider round ${!canEdit ? 'disabled' : ''}`}></span>
                        </label>
                    </div>

                    {settings.podft_filter_enabled && (
                        <div style={{marginTop: '15px'}}>
                            <div className="input-group">
                                <label className="input-label">Колонка фильтра</label>
                                <input className="text-input" disabled={!canEdit} value={settings.podft_filter_col} onChange={(e) => handleChange('podft_filter_col', e.target.value)} />
                            </div>
                            <div className="input-group" style={{marginBottom: 0}}>
                                <label className="input-label">Исключать значения (через запятую)</label>
                                <input className="text-input" disabled={!canEdit} value={settings.podft_filter_values} onChange={(e) => handleChange('podft_filter_values', e.target.value)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* 3. КРИПТА */}
        {activeTab === 'crypto' && (
            <div className="fade-in">
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px'}}>
                    <h3 style={{margin: 0}}>Криптовалюта</h3>
                    <label className="switch">
                        <input type="checkbox" disabled={!canEdit} checked={settings.crypto_enabled} onChange={() => handleToggle('crypto_enabled')} />
                        <span className={`slider round ${!canEdit ? 'disabled' : ''}`}></span>
                    </label>
                </div>
                {settings.crypto_enabled ? (
                    <>
                        <div className="input-group">
                            <label className="input-label">Колонка поиска</label>
                            <input className="text-input" disabled={!canEdit} value={settings.crypto_col} onChange={(e) => handleChange('crypto_col', e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Ключевые слова</label>
                            <textarea className="text-input" disabled={!canEdit} style={{height: '100px'}} value={settings.crypto_keywords} onChange={(e) => handleChange('crypto_keywords', e.target.value)} />
                            <div className="hint">Разделитель запятая (USDT, BTC, ETH)</div>
                        </div>
                    </>
                ) : <p style={{color: '#94a3b8', textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '8px'}}>Функция выключена</p>}
            </div>
        )}

        {/* 4. БОНДЫ */}
        {activeTab === 'bonds' && (
            <div className="fade-in">
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px'}}>
                    <h3 style={{margin: 0}}>Бонды и Опционы</h3>
                    <label className="switch">
                        <input type="checkbox" disabled={!canEdit} checked={settings.bo_enabled} onChange={() => handleToggle('bo_enabled')} />
                        <span className={`slider round ${!canEdit ? 'disabled' : ''}`}></span>
                    </label>
                </div>
                {settings.bo_enabled && (
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                        <div className="input-group"><label className="input-label">Колонка Instrument</label><input className="text-input" disabled={!canEdit} value={settings.bo_unity_instrument_col} onChange={(e) => handleChange('bo_unity_instrument_col', e.target.value)} /></div>
                        <div className="input-group"><label className="input-label">Колонка Сумма</label><input className="text-input" disabled={!canEdit} value={settings.bo_ais_sum_col} onChange={(e) => handleChange('bo_ais_sum_col', e.target.value)} /></div>
                        <div className="input-group"><label className="input-label">Порог</label><input className="text-input" disabled={!canEdit} value={settings.bo_threshold} onChange={(e) => handleChange('bo_threshold', e.target.value)} /></div>
                        <div className="input-group"><label className="input-label">Префиксы</label><input className="text-input" disabled={!canEdit} value={settings.bo_prefixes} onChange={(e) => handleChange('bo_prefixes', e.target.value)} /></div>
                    </div>
                )}
            </div>
        )}

        {/* 5. СПЛИТЫ */}
        {activeTab === 'splits' && (
            <div className="fade-in">
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px'}}>
                    <h3 style={{margin: 0}}>Настройки Сплитов</h3>
                    <label className="switch">
                        <input type="checkbox" disabled={!canEdit} checked={settings.split_check_enabled} onChange={() => handleToggle('split_check_enabled')} />
                        <span className={`slider round ${!canEdit ? 'disabled' : ''}`}></span>
                    </label>
                </div>
                {settings.split_check_enabled && (
                    <>
                        <div className="input-group" style={{background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                            <label className="input-label" style={{marginBottom: '10px'}}>Файл справочника</label>
                            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                <input className="text-input" disabled value={settings.split_list_path ? settings.split_list_path.split(/[\\/]/).pop() : "Нет файла"} style={{marginBottom: 0, background: 'white'}} />
                                {canEdit && (
                                    <label className="btn" style={{cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                        <Upload size={16}/> Обзор...
                                        <input type="file" hidden accept=".xlsx, .xls" onChange={handleSplitFileSelect} />
                                    </label>
                                )}
                            </div>
                        </div>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px'}}>
                            <div className="input-group"><label className="input-label">Столбец ISIN</label><input className="text-input" disabled={!canEdit} value={settings.split_list_isin_col} onChange={(e) => handleChange('split_list_isin_col', e.target.value)} /></div>
                            <div className="input-group"><label className="input-label">Столбец ЦБ</label><input className="text-input" disabled={!canEdit} value={settings.daily_file_security_col} onChange={(e) => handleChange('daily_file_security_col', e.target.value)} /></div>
                            <div className="input-group"><label className="input-label">Столбец Кол-во</label><input className="text-input" disabled={!canEdit} value={settings.split_daily_qty_col} onChange={(e) => handleChange('split_daily_qty_col', e.target.value)} /></div>
                        </div>
                    </>
                )}
            </div>
        )}

        {/* 6. БАЗА (ИСКЛЮЧЕНИЯ) */}
        {activeTab === 'database' && (
            <div className="fade-in">
                <h3 style={{marginTop: 0}}>Счета перекрытия (Исключения)</h3>
                <p style={{fontSize: '13px', color: '#64748b'}}>Каждый счет с новой строки. Эти счета будут игнорироваться при сверке.</p>
                <textarea
                    className="text-input"
                    disabled={!canEdit}
                    style={{height: '250px', fontFamily: 'monospace', lineHeight: '1.6'}}
                    value={settings.overlap_accounts.join('\n')}
                    onChange={handleOverlapChange}
                />
            </div>
        )}

        {/* КНОПКА СОХРАНИТЬ ВНИЗУ (ТОЛЬКО ДЛЯ Back Office или Админа) */}
        {activeTab !== 'account' && canEdit && (
            <div style={{ marginTop: '30px', borderTop: '1px solid #e2e8f0', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    className="btn"
                    onClick={saveSettings}
                    disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 30px', fontSize: '16px',
                        background: '#3b82f6', color: 'white', border: 'none',
                        boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
                    }}
                >
                    <Save size={20} /> {saving ? "Сохранение..." : "Сохранить изменения"}
                </button>
            </div>
        )}

      </div>

      <style>{`
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        
        .switch { position: relative; display: inline-block; width: 40px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; border-radius: 24px; }
        .slider.disabled { cursor: not-allowed; opacity: 0.6; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #3b82f6; }
        input:checked + .slider.disabled { background-color: #93c5fd; }
        input:checked + .slider:before { transform: translateX(16px); }
        
        .text-input:disabled { background-color: #f1f5f9; color: #94a3b8; cursor: not-allowed; }
      `}</style>

    </div>
  );
};

export default SettingsPage;