import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Search, UserPlus, Trash2, Mail, FileText,
  Download, X, Edit, Lock, ShieldAlert,
  ChevronRight, Upload, Briefcase
} from 'lucide-react';
import { toast } from 'react-toastify';

const STATUS_STYLES = {
  "Нет": { bg: "#f1f5f9", color: "#64748b", label: "Нет отчетов" },
  "В ожидании": { bg: "#fef9c3", color: "#b45309", label: "В ожидании" },
  "Отправлено": { bg: "#dcfce7", color: "#166534", label: "Отправлено" }
};

const STATUS_DB_MAP = { "gray": "Нет", "yellow": "В ожидании", "green": "Отправлено" };
const STATUS_DISPLAY_MAP = { "Нет": "gray", "В ожидании": "yellow", "Отправлено": "green" };

const ReportsPage = () => {

  const [userDept, setUserDept] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", account: "", folder_path: "" });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState({ name: "", email: "", account: "", folder_path: "" });

  // 1. ПРОВЕРКА ПРАВ
  useEffect(() => {
    const checkPermission = async () => {
      try {
          const token = localStorage.getItem('token');
          const res = await axios.get('http://127.0.0.1:8000/api/profile', { headers: { Authorization: `Bearer ${token}` } });
          setUserDept(res.data.department);
          setIsAdmin(res.data.is_admin);
          if (res.data.department === 'Back Office' || res.data.is_admin) fetchClients("", token);
      } catch (e) { console.error(e); } finally { setLoadingAuth(false); }
    };
    checkPermission();
  }, []);

  // 2. ЗАГРУЗКА ДАННЫХ
  const fetchClients = async (searchTerm = "", tokenOverride = null) => {
    try {
      const token = tokenOverride || localStorage.getItem('token');
      const res = await axios.get(`http://127.0.0.1:8000/api/clients?search=${searchTerm}`, { headers: { Authorization: `Bearer ${token}` } });
      setClients(res.data);
    } catch (e) { console.error(e); }
  };

  // 3. ФИЛЬТРАЦИЯ
  useEffect(() => {
    let result = clients;
    if (statusFilter !== "All") result = result.filter(c => c.status === statusFilter);
    setFilteredClients(result);
  }, [clients, statusFilter]);

  useEffect(() => {
    if ((userDept === 'Back Office' || isAdmin) && !loadingAuth) {
        const timer = setTimeout(() => fetchClients(search), 300);
        return () => clearTimeout(timer);
    }
  }, [search]);

  // 4. РАБОТА С DRAWER (ПАНЕЛЬЮ)
  const openDrawer = (client) => {
      setSelectedClient(client);
      setClientDetails(null);
      setIsDrawerOpen(true);
      document.body.style.overflow = 'hidden';
      fetchDetails(client.id);
  };

  const closeDrawer = () => {
      setIsDrawerOpen(false);
      document.body.style.overflow = 'auto';
      setTimeout(() => setSelectedClient(null), 300);
  };

  const fetchDetails = async (id) => {
      try {
          const token = localStorage.getItem('token');
          const res = await axios.get(`http://127.0.0.1:8000/api/clients/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          setClientDetails(res.data);
      } catch (e) { console.error(e); }
  };


  const handleAddClient = async () => {
      if (!newClient.name.trim()) return toast.warning("Нужно имя");
      const formData = new FormData();
      Object.keys(newClient).forEach(k => formData.append(k, newClient[k]));
      try {
          const token = localStorage.getItem('token');
          await axios.post('http://127.0.0.1:8000/api/clients', formData, { headers: { Authorization: `Bearer ${token}` } });
          setShowAddModal(false); setNewClient({ name: "", email: "", account: "", folder_path: "" }); fetchClients(search); toast.success("Создано");
      } catch (e) { toast.error("Ошибка"); }
  };

  // --- ОБНОВЛЕНИЕ КЛИЕНТА (РЕДАКТИРОВАНИЕ) ---
  const openEditModal = () => {
      if (!clientDetails) return;
      setEditingClient({
          name: clientDetails.name,
          email: clientDetails.email || "",
          account: clientDetails.account_number || "",
          folder_path: clientDetails.folder_path || ""
      });
      setShowEditModal(true);
  };

  const handleUpdateClient = async () => {
      if (!editingClient.name.trim()) return;
      const formData = new FormData();
      formData.append('name', editingClient.name);
      formData.append('email', editingClient.email);
      formData.append('account', editingClient.account);
      formData.append('folder_path', editingClient.folder_path);

      try {
          const token = localStorage.getItem('token');
          // Используем selectedClient.id, так как Drawer открыт
          await axios.put(`http://127.0.0.1:8000/api/clients/${selectedClient.id}`, formData, { headers: { Authorization: `Bearer ${token}` }});
          setShowEditModal(false);
          fetchDetails(selectedClient.id); // Обновляем детали в Drawer
          fetchClients(search); // Обновляем список
          toast.success("Данные обновлены");
      } catch (e) { toast.error("Ошибка обновления"); }
  };

  const handleStatusChange = async (newStatusDisplay) => {
    const dbStatus = STATUS_DISPLAY_MAP[newStatusDisplay];
    try {
        const token = localStorage.getItem('token');
        await axios.put(`http://127.0.0.1:8000/api/clients/${selectedClient.id}/status`, { status: dbStatus }, { headers: { Authorization: `Bearer ${token}` } });
        setClientDetails(prev => ({...prev, status: dbStatus}));
        setClients(prev => prev.map(c => c.id === selectedClient.id ? {...c, status: dbStatus} : c));
        toast.info("Статус обновлен");
    } catch (e) { toast.error("Ошибка"); }
  };

  const handleDeleteClient = async () => {
      if(!confirm("Удалить клиента?")) return;
      try {
          const token = localStorage.getItem('token');
          await axios.delete(`http://127.0.0.1:8000/api/clients/${selectedClient.id}`, { headers: { Authorization: `Bearer ${token}` } });
          closeDrawer(); fetchClients(search); toast.success("Удалено");
      } catch (e) { toast.error("Ошибка"); }
  };

  const handleFileUpload = async (e) => {
      const file = e.target.files[0]; if(!file) return;
      const formData = new FormData(); formData.append('file', file);
      try {
          const token = localStorage.getItem('token');
          await axios.post(`http://127.0.0.1:8000/api/clients/${selectedClient.id}/upload`, formData, { headers: { Authorization: `Bearer ${token}` } });
          fetchDetails(selectedClient.id); toast.success("Загружено");
      } catch (e) { toast.error("Ошибка"); }
  };

  const handleDeleteFile = async (filename) => {
      if(!confirm("Удалить файл?")) return;
      try {
          const token = localStorage.getItem('token');
          await axios.delete(`http://127.0.0.1:8000/api/clients/${selectedClient.id}/files/${filename}`, { headers: { Authorization: `Bearer ${token}` } });
          fetchDetails(selectedClient.id); toast.success("Файл удален");
      } catch (e) { toast.error("Ошибка"); }
  };

  const handleDownloadFile = async (filename) => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://127.0.0.1:8000/api/clients/${selectedClient.id}/files/${filename}`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a'); link.href = url; link.setAttribute('download', filename); document.body.appendChild(link); link.click();
      } catch (e) { toast.error("Ошибка"); }
  };

  // --- ЗАГЛУШКА ДОСТУПА ---
    if (loadingAuth) return <div style={{padding: 40, textAlign: 'center'}}>Загрузка...</div>;
    if (userDept !== 'Back Office' && !isAdmin) {
      return (
          <div style={{
              height: '80vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b'
          }}>
              <div style={{background: '#fee2e2', padding: '20px', borderRadius: '50%', marginBottom: '20px'}}>
                  <Lock size={48} color="#ef4444" />
              </div>
              <h2 style={{color: '#1e293b', marginBottom: '10px'}}>Доступ ограничен</h2>
              <p style={{textAlign: 'center', maxWidth: '400px'}}>
                  Раздел <b>"Отчеты"</b> доступен только для сотрудников департамента
                  <span style={{background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '5px', fontWeight: 600}}>Back Office</span>.
              </p>
              <div style={{marginTop: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px'}}>
                  <ShieldAlert size={16}/> Ваш отдел: <b>{userDept}</b>
              </div>
          </div>
      );
  }

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', paddingRight: '10px' }}>

      {/* 1. ЗАГОЛОВОК И ФИЛЬТРЫ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Клиентские отчеты</h1>
        <button className="btn" onClick={() => setShowAddModal(true)} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <UserPlus size={18} /> Добавить клиента
        </button>
      </div>

      <div className="card" style={{ padding: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: '250px', display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '0 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <Search size={18} color="#94a3b8" />
            <input
                className="text-input"
                placeholder="Поиск по имени или счету..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', background: 'transparent', boxShadow: 'none', height: '40px', marginBottom: 0 }}
            />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
            {['All', 'gray', 'yellow', 'green'].map(status => (
                <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    style={{
                        padding: '8px 16px', borderRadius: '20px', border: '1px solid',
                        borderColor: statusFilter === status ? '#3b82f6' : '#e2e8f0',
                        background: statusFilter === status ? '#eff6ff' : 'white',
                        color: statusFilter === status ? '#2563eb' : '#64748b',
                        fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                >
                    {status === 'All' ? 'Все' : STATUS_DB_MAP[status]}
                </button>
            ))}
        </div>
      </div>

      {/* 2. ТАБЛИЦА КЛИЕНТОВ */}
      <div className="card" style={{ padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{overflowY: 'auto', flex: 1}}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', position: 'sticky', top: 0 }}>
                    <tr>
                        <th style={{ padding: '15px', textAlign: 'left', width: '40%' }}>Клиент</th>
                        <th style={{ padding: '15px', textAlign: 'left' }}>Статус</th>
                        <th style={{ padding: '15px', textAlign: 'right' }}>Действие</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredClients.map(client => {
                        const statusInfo = STATUS_STYLES[STATUS_DB_MAP[client.status]] || STATUS_STYLES["Нет"];
                        return (
                            <tr
                                key={client.id}
                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.1s' }}
                                className="table-row-hover"
                                onClick={() => openDrawer(client)}
                            >
                                <td style={{ padding: '15px' }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{client.name}</div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>ID: {client.id}</div>
                                </td>
                                <td style={{ padding: '15px' }}>
                                    <span style={{
                                        padding: '4px 10px', borderRadius: '15px', fontSize: '12px', fontWeight: 600,
                                        background: statusInfo.bg, color: statusInfo.color
                                    }}>
                                        {statusInfo.label}
                                    </span>
                                </td>
                                <td style={{ padding: '15px', textAlign: 'right' }}>
                                    <button className="btn-icon" style={{color: '#94a3b8'}}><ChevronRight size={20}/></button>
                                </td>
                            </tr>
                        );
                    })}
                    {filteredClients.length === 0 && (
                        <tr><td colSpan="3" style={{padding: '30px', textAlign: 'center', color: '#94a3b8'}}>Клиенты не найдены</td></tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* 3. ЗАТЕМНЕНИЕ (BACKDROP) */}
      {isDrawerOpen && (
        <div
            onClick={closeDrawer}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.4)',
                zIndex: 40
            }}
        />
      )}

      {/* 4. SLIDE-OVER DRAWER (ВЫЕЗЖАЮЩАЯ ПАНЕЛЬ) */}
      <div style={{
          position: 'fixed', top: 0, right: 0, height: '100%', width: '500px', maxWidth: '85vw',
          backgroundColor: 'white', boxShadow: '-10px 0 30px rgba(0,0,0,0.15)',
          transform: isDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 50,
          display: 'flex', flexDirection: 'column'
      }}>
        {selectedClient && (
            <>
                {/* Шапка Drawer */}
                <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Карточка клиента</h2>
                    <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748b" /></button>
                </div>

                {/* Контент Drawer */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '25px' }}>
                    {!clientDetails ? (
                        <div style={{textAlign:'center', marginTop: '50px', color: '#94a3b8'}}>Загрузка данных...</div>
                    ) : (
                        <>
                            <div style={{ marginBottom: '30px' }}>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                                    <h3 style={{ margin: 0, fontSize: '22px', color: '#1e293b' }}>{clientDetails.name}</h3>
                                    <button onClick={openEditModal} title="Редактировать" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6' }}>
                                        <Edit size={20} />
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px', background: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                        <Mail size={16} color="#94a3b8"/>
                                        <span style={{color: '#334155'}}>{clientDetails.email || "Email не указан"}</span>
                                    </div>
                                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                        <Briefcase size={16} color="#94a3b8"/>
                                        <span style={{color: '#334155'}}>{clientDetails.account_number || "Счет не указан"}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '30px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Статус отчетов</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {['Нет', 'В ожидании', 'Отправлено'].map(st => (
                                        <button
                                            key={st}
                                            onClick={() => handleStatusChange(st)}
                                            style={{
                                                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid', fontSize: '12px', cursor: 'pointer',
                                                borderColor: STATUS_DB_MAP[clientDetails.status] === st ? STATUS_STYLES[st].color : '#e2e8f0',
                                                background: STATUS_DB_MAP[clientDetails.status] === st ? STATUS_STYLES[st].bg : 'white',
                                                color: STATUS_DB_MAP[clientDetails.status] === st ? STATUS_STYLES[st].color : '#64748b',
                                                fontWeight: STATUS_DB_MAP[clientDetails.status] === st ? 600 : 400
                                            }}
                                        >
                                            {st}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                                    <h4 style={{margin: 0, fontSize: '16px'}}>Файлы ({clientDetails.files ? clientDetails.files.length : 0})</h4>
                                    <label className="btn" style={{padding: '5px 10px', fontSize: '12px', cursor: 'pointer'}}>
                                        <Upload size={14} style={{marginRight: '5px'}}/> Загрузить
                                        <input type="file" hidden onChange={handleFileUpload} />
                                    </label>
                                </div>

                                {clientDetails.files && clientDetails.files.length > 0 ? (
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                                        {clientDetails.files.map((file, idx) => (
                                            <div key={idx} style={{display: 'flex', alignItems: 'center', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f9fafb'}}>
                                                <div style={{background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginRight: '10px'}}>
                                                    <FileText size={20} color="#3b82f6"/>
                                                </div>
                                                <div style={{flex: 1, minWidth: 0}}>
                                                    <div style={{fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{file.name}</div>
                                                    <div style={{fontSize: '11px', color: '#94a3b8'}}>{new Date(file.modified * 1000).toLocaleDateString()}</div>
                                                </div>
                                                <button onClick={() => handleDownloadFile(file.name)} style={{background:'none', border:'none', cursor:'pointer', color:'#64748b', padding: '5px'}}><Download size={16}/></button>
                                                <button onClick={() => handleDeleteFile(file.name)} style={{background:'none', border:'none', cursor:'pointer', color:'#ef4444', padding: '5px'}}><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{textAlign:'center', padding: '30px', border: '2px dashed #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '13px'}}>
                                        Нет загруженных файлов
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Подвал Drawer */}
                <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => { window.location.href = `mailto:${clientDetails?.email}` }}
                        className="btn"
                        style={{ flex: 1, background: '#3b82f6', justifyContent: 'center' }}
                        disabled={!clientDetails?.email}
                    >
                        <Mail size={18} style={{marginRight: '8px'}}/> Написать
                    </button>
                    <button onClick={handleDeleteClient} className="btn" style={{ background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca' }}>
                        <Trash2 size={18} />
                    </button>
                </div>
            </>
        )}
      </div>

      {/* ДОБАВЛЕНИЯ */}
      {showAddModal && (
        <ClientModal
            title="Новый клиент"
            data={newClient} setData={setNewClient}
            onSave={handleAddClient} onClose={() => setShowAddModal(false)}
        />
      )}

      {/* РЕДАКТИРОВАНИЯ */}
      {showEditModal && (
        <ClientModal
            title="Редактировать"
            data={editingClient} setData={setEditingClient}
            onSave={handleUpdateClient} onClose={() => setShowEditModal(false)}
        />
      )}

      <style>{`
        .table-row-hover:hover { background-color: #f8fafc; }
        .btn-icon { background: none; border: none; cursor: pointer; }
        .btn-icon:hover { color: #3b82f6; }
      `}</style>
    </div>
  );
};


const ClientModal = ({ title, data, setData, onSave, onClose }) => (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 1100
    }}>
        <div className="card" style={{ width: '400px', padding: '30px', position: 'relative' }}>
            <button onClick={onClose} style={{position: 'absolute', top: '10px', right: '10px', background:'none', border:'none', cursor:'pointer'}}>
                <X size={20} />
            </button>
            <h2 style={{marginTop: 0}}>{title}</h2>

            <div className="input-group">
                <label className="input-label">Имя клиента *</label>
                <input className="text-input" value={data.name} onChange={e => setData({...data, name: e.target.value})} />
            </div>
            <div className="input-group">
                <label className="input-label">Email</label>
                <input className="text-input" value={data.email} onChange={e => setData({...data, email: e.target.value})} />
            </div>
            <div className="input-group">
                <label className="input-label">Номер счета</label>
                <input className="text-input" value={data.account} onChange={e => setData({...data, account: e.target.value})} />
            </div>
            <div className="input-group">
                <label className="input-label">Путь к папке (необязательно)</label>
                <input className="text-input" placeholder="Оставьте пустым для авто" value={data.folder_path} onChange={e => setData({...data, folder_path: e.target.value})} />
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px'}}>
                <button className="btn" style={{background: '#94a3b8'}} onClick={onClose}>Отмена</button>
                <button className="btn" onClick={onSave}>Сохранить</button>
            </div>
        </div>
    </div>
);

export default ReportsPage;