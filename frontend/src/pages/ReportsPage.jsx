// frontend/src/pages/ReportsPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, UserPlus, Trash2, Mail, FileText, Download, X, Edit } from 'lucide-react';
import { toast } from 'react-toastify'; // <-- ВАЖНЫЙ ИМПОРТ

const STATUS_COLORS = {
  "Нет": "gray",
  "В ожидании": "#eab308", // Yellow
  "Отправлено": "#10b981"  // Green
};

const STATUS_DB_MAP = {
    "gray": "Нет",
    "yellow": "В ожидании",
    "green": "Отправлено"
};

const ReportsPage = () => {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [loadingList, setLoadingList] = useState(false);

  // --- МОДАЛКА ДОБАВЛЕНИЯ ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClient, setNewClient] = useState({
      name: "", email: "", account: "", folder_path: ""
  });

  // --- МОДАЛКА РЕДАКТИРОВАНИЯ ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState({
      name: "", email: "", account: "", folder_path: ""
  });

  // Загрузка списка
  const fetchClients = async (searchTerm = "") => {
    setLoadingList(true);
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/clients?search=${searchTerm}`);
      setClients(res.data);
    } catch (e) {
      console.error(e);
      // toast.error("Ошибка загрузки списка клиентов"); // Можно не спамить этим, если просто инет моргнул
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { fetchClients(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchClients(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedId) {
        setClientDetails(null);
        return;
    }
    fetchDetails(selectedId);
  }, [selectedId]);

  const fetchDetails = async (id) => {
      try {
          const res = await axios.get(`http://127.0.0.1:8000/api/clients/${id}`);
          setClientDetails(res.data);
      } catch (e) { console.error(e); }
  };

  // --- ФУНКЦИЯ ДОБАВЛЕНИЯ ---
  const handleAddClient = async () => {
      if (!newClient.name.trim()) {
          toast.warning("Введите имя клиента!"); // <-- УВЕДОМЛЕНИЕ
          return;
      }
      const formData = new FormData();
      formData.append('name', newClient.name);
      formData.append('email', newClient.email);
      formData.append('account', newClient.account);
      formData.append('folder_path', newClient.folder_path);

      try {
          await axios.post('http://127.0.0.1:8000/api/clients', formData);
          setShowAddModal(false);
          setNewClient({ name: "", email: "", account: "", folder_path: "" });
          fetchClients(search);
          toast.success("Клиент успешно добавлен!"); // <-- УСПЕХ
      } catch (e) {
          const msg = e.response?.data?.detail || e.message;
          toast.error("Ошибка добавления: " + msg); // <-- ОШИБКА
      }
  };

  // --- ФУНКЦИЯ РЕДАКТИРОВАНИЯ (ПОДГОТОВКА) ---
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

  // --- ФУНКЦИЯ СОХРАНЕНИЯ РЕДАКТИРОВАНИЯ ---
  const handleUpdateClient = async () => {
      if (!editingClient.name.trim()) {
          toast.warning("Имя не может быть пустым");
          return;
      }

      const formData = new FormData();
      formData.append('name', editingClient.name);
      formData.append('email', editingClient.email);
      formData.append('account', editingClient.account);
      formData.append('folder_path', editingClient.folder_path);

      try {
          await axios.put(`http://127.0.0.1:8000/api/clients/${selectedId}`, formData);
          setShowEditModal(false);
          fetchDetails(selectedId);
          fetchClients(search);
          toast.success("Данные клиента обновлены!"); // <-- УСПЕХ
      } catch (e) {
          toast.error("Ошибка обновления: " + (e.response?.data?.detail || e.message));
      }
  };

  const handleStatusChange = async (newStatusDisplay) => {
    const dbStatus = Object.keys(STATUS_DB_MAP).find(key => STATUS_DB_MAP[key] === newStatusDisplay);
    try {
        await axios.put(`http://127.0.0.1:8000/api/clients/${selectedId}/status`, { status: dbStatus });
        setClientDetails(prev => ({...prev, status: dbStatus}));
        fetchClients(search);
        toast.info(`Статус изменен на "${newStatusDisplay}"`); // <-- ИНФО
    } catch (e) {
        toast.error("Ошибка обновления статуса");
    }
  };

  const handleDeleteFile = async (filename) => {
      if(!confirm(`Удалить файл ${filename}?`)) return;
      try {
          await axios.delete(`http://127.0.0.1:8000/api/clients/${selectedId}/files/${filename}`);
          fetchDetails(selectedId);
          toast.success("Файл удален");
      } catch (e) {
          toast.error("Ошибка удаления файла");
      }
  };

  const handleDownloadFile = async (filename) => {
      try {
        const res = await axios.get(`http://127.0.0.1:8000/api/clients/${selectedId}/files/${filename}`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        // toast.info("Скачивание началось..."); // Можно раскомментировать
      } catch (e) {
          toast.error("Ошибка скачивания файла");
      }
  };

  const handleFileUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
          await axios.post(`http://127.0.0.1:8000/api/clients/${selectedId}/upload`, formData);
          fetchDetails(selectedId);
          toast.success("Файл загружен!");
      } catch (e) {
          toast.error("Ошибка загрузки файла");
      }
  };

  const handleEmail = () => {
      if(!clientDetails?.email) return toast.warning("Email не указан у этого клиента");
      window.location.href = `mailto:${clientDetails.email}?subject=Отчеты`;
  };

  const handleDeleteClient = async () => {
      if(!confirm("Удалить клиента и все его данные? Это действие необратимо.")) return;
      try {
          await axios.delete(`http://127.0.0.1:8000/api/clients/${selectedId}`);
          setSelectedId(null);
          setClientDetails(null);
          fetchClients(search);
          toast.success("Клиент удален");
      } catch (e) {
          toast.error("Ошибка удаления: " + e.message);
      }
  };

  return (
    <div style={{display: 'flex', height: '85vh', gap: '20px', position: 'relative'}}>

      {/* ЛЕВАЯ КОЛОНКА */}
      <div className="card" style={{width: '300px', display: 'flex', flexDirection: 'column', padding: '15px'}}>
        <div className="input-group" style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
            <Search size={18} color="#666"/>
            <input
                className="text-input"
                placeholder="Поиск клиента..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{border: 'none', background: '#f1f5f9'}}
            />
        </div>

        <div style={{flex: 1, overflowY: 'auto', marginTop: '10px'}}>
            {clients.map(client => (
                <div
                    key={client.id}
                    onClick={() => setSelectedId(client.id)}
                    style={{
                        padding: '10px', cursor: 'pointer', borderRadius: '6px',
                        backgroundColor: selectedId === client.id ? '#e0f2fe' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: '10px'
                    }}
                >
                    <div style={{
                        width: '10px', height: '10px', borderRadius: '50%',
                        backgroundColor: STATUS_COLORS[STATUS_DB_MAP[client.status] || "Нет"]
                    }} />
                    <span style={{fontWeight: selectedId === client.id ? 'bold' : 'normal'}}>
                        {client.name}
                    </span>
                </div>
            ))}
        </div>

        <button className="btn" onClick={() => setShowAddModal(true)} style={{marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '5px'}}>
            <UserPlus size={16} /> Добавить
        </button>
      </div>

      {/* ПРАВАЯ КОЛОНКА */}
      <div className="card" style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
        {!clientDetails ? (
            <div style={{display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#94a3b8'}}>
                Выберите клиента из списка слева
            </div>
        ) : (
            <>
                {/* ШАПКА КАРТОЧКИ */}
                <div style={{borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '15px'}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <h2 style={{margin: 0, marginBottom: '10px'}}>{clientDetails.name}</h2>

                        <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={openEditModal} title="Редактировать" style={{background:'none', border:'none', cursor:'pointer', color:'#3b82f6'}}>
                                <Edit size={20} />
                            </button>
                            <button onClick={handleDeleteClient} title="Удалить" style={{background:'none', border:'none', cursor:'pointer', color:'#ef4444'}}>
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 20px', fontSize: '14px'}}>
                        <strong>Email:</strong> {clientDetails.email || "—"}
                        <strong>Счет:</strong> {clientDetails.account_number || "—"}
                        <strong>Статус:</strong>
                        <select
                            value={STATUS_DB_MAP[clientDetails.status]}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            style={{padding: '5px', borderRadius: '4px', border: '1px solid #ccc'}}
                        >
                            <option>Нет</option>
                            <option>В ожидании</option>
                            <option>Отправлено</option>
                        </select>
                    </div>
                </div>

                {/* СПИСОК ФАЙЛОВ */}
                <div style={{flex: 1, overflowY: 'auto'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                        <h3 style={{margin: 0}}>Файлы</h3>
                        <label className="btn" style={{cursor: 'pointer', fontSize: '12px', padding: '5px 10px'}}>
                            + Загрузить
                            <input type="file" style={{display: 'none'}} onChange={handleFileUpload}/>
                        </label>
                    </div>

                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px'}}>
                        <thead style={{background: '#f8fafc', textAlign: 'left'}}>
                            <tr>
                                <th style={{padding: '8px'}}>Имя файла</th>
                                <th style={{padding: '8px'}}>Дата</th>
                                <th style={{padding: '8px', textAlign: 'right'}}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {clientDetails.files && clientDetails.files.length > 0 ? (
                                clientDetails.files.map((file, idx) => (
                                    <tr key={idx} style={{borderBottom: '1px solid #f1f5f9'}}>
                                        <td style={{padding: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                            <FileText size={16} color="#64748b"/>
                                            {file.name}
                                        </td>
                                        <td style={{padding: '8px', color: '#64748b'}}>
                                            {new Date(file.modified * 1000).toLocaleString()}
                                        </td>
                                        <td style={{padding: '8px', textAlign: 'right'}}>
                                            <button onClick={() => handleDownloadFile(file.name)} style={{background: 'none', border: 'none', cursor: 'pointer', marginRight: '10px'}}>
                                                <Download size={16} color="#3b82f6"/>
                                            </button>
                                            <button onClick={() => handleDeleteFile(file.name)} style={{background: 'none', border: 'none', cursor: 'pointer'}}>
                                                <Trash2 size={16} color="#ef4444"/>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="3" style={{padding: '20px', textAlign: 'center', color: '#94a3b8'}}>Нет файлов</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={{marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #e2e8f0'}}>
                    <button className="btn" onClick={handleEmail} style={{background: '#6366f1'}}>
                        <Mail size={16} style={{marginRight: '5px'}}/> Написать письмо
                    </button>
                </div>
            </>
        )}
      </div>

      {/* МОДАЛКА: ДОБАВИТЬ */}
      {showAddModal && (
        <ClientModal
            title="Новый клиент"
            data={newClient}
            setData={setNewClient}
            onSave={handleAddClient}
            onClose={() => setShowAddModal(false)}
        />
      )}

      {/* МОДАЛКА: РЕДАКТИРОВАТЬ */}
      {showEditModal && (
        <ClientModal
            title="Редактировать"
            data={editingClient}
            setData={setEditingClient}
            onSave={handleUpdateClient}
            onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
};

// Компонент модального окна
const ClientModal = ({ title, data, setData, onSave, onClose }) => (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 1000
    }}>
        <div className="card" style={{width: '400px', padding: '20px', position: 'relative'}}>
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