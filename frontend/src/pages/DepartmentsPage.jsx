import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, Plus, MessageSquare, Send, Trash2, Edit2,
  CheckCircle, Clock, Circle, Save, X, Paperclip, FileText, Download
} from 'lucide-react';
import { toast } from 'react-toastify';

const STATUS_CONFIG = {
  'Open': { label: 'Новая', color: '#64748b', bg: '#f1f5f9', icon: Circle },
  'In Progress': { label: 'В работе', color: '#3b82f6', bg: '#eff6ff', icon: Clock },
  'Done': { label: 'Выполнено', color: '#10b981', bg: '#ecfdf5', icon: CheckCircle }
};

const DepartmentsPage = () => {
  const [departments, setDepartments] = useState([]);
  const [activeDept, setActiveDept] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(true);

  // --- СОЗДАНИЕ НОВОЙ ЗАДАЧИ ---
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskFile, setNewTaskFile] = useState(null); // Файл при создании

  // --- ПРОСМОТР / РЕДАКТИРОВАНИЕ ---
  const [expandedTask, setExpandedTask] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Комментарии и вложения
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [attachments, setAttachments] = useState([]); // Список вложений

  // 1. ЗАГРУЗКА ОТДЕЛОВ
  useEffect(() => { fetchDepartments(); }, []);
  // 2. ЗАГРУЗКА ЗАДАЧ
  useEffect(() => { if (activeDept) fetchTasks(); }, [activeDept]);

  const fetchDepartments = async () => {
    try {
        const res = await axios.get('http://127.0.0.1:8000/api/departments');
        setDepartments(res.data);
        if (res.data.length > 0) setActiveDept(res.data[0].name);
        setLoadingDepts(false);
    } catch (err) { setLoadingDepts(false); }
  };

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`http://127.0.0.1:8000/api/tasks/${activeDept}`, { headers: { Authorization: `Bearer ${token}` } });
      setTasks(res.data);
    } catch (err) { console.error(err); }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle) return toast.error("Введите заголовок");

    try {
      const token = localStorage.getItem('token');

      const taskRes = await axios.post('http://127.0.0.1:8000/api/tasks', {
        title: newTaskTitle,
        description: newTaskDesc,
        to_department: activeDept
      }, { headers: { Authorization: `Bearer ${token}` } });

      const newTaskId = taskRes.data.id;

      if (newTaskFile && newTaskId) {
          const formData = new FormData();
          formData.append('file', newTaskFile);
          await axios.post(`http://127.0.0.1:8000/api/tasks/${newTaskId}/attachments`, formData, {
              headers: { Authorization: `Bearer ${token}` }
          });
      }

      toast.success("Задача создана!");
      setShowModal(false);
      setNewTaskTitle(""); setNewTaskDesc(""); setNewTaskFile(null);
      fetchTasks();
    } catch (err) {
      toast.error("Ошибка создания задачи");
      console.error(err);
    }
  };

  const openTask = async (task) => {
    setExpandedTask(task);
    setIsEditing(false);
    setEditTitle(task.title);
    setEditDesc(task.description);
    setComments([]);
    setAttachments([]);

    try {
      const token = localStorage.getItem('token');
      const [resComments, resFiles] = await Promise.all([
          axios.get(`http://127.0.0.1:8000/api/tasks/${task.id}/comments`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`http://127.0.0.1:8000/api/tasks/${task.id}/attachments`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setComments(resComments.data);
      setAttachments(resFiles.data);
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = async (e) => {
      const file = e.target.files[0]; if(!file) return;
      const formData = new FormData(); formData.append('file', file);
      try {
          const token = localStorage.getItem('token');
          await axios.post(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}/attachments`, formData, { headers: { Authorization: `Bearer ${token}` } });
          const res = await axios.get(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}/attachments`, { headers: { Authorization: `Bearer ${token}` } });
          setAttachments(res.data);
          toast.success("Файл загружен");
      } catch (e) { toast.error("Ошибка загрузки"); }
  };

  const handleDownloadFile = async (file) => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://127.0.0.1:8000/api/attachments/${file.id}`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a'); link.href = url; link.setAttribute('download', file.filename); document.body.appendChild(link); link.click();
      } catch (e) { toast.error("Ошибка скачивания"); }
  };

  const handleDeleteFile = async (id) => {
      if(!confirm("Удалить файл?")) return;
      try {
          const token = localStorage.getItem('token');
          await axios.delete(`http://127.0.0.1:8000/api/attachments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          setAttachments(prev => prev.filter(f => f.id !== id));
      } catch (e) { toast.error("Ошибка"); }
  };

  // --- СТАТУС, УДАЛЕНИЕ, РЕДАКТИРОВАНИЕ ---
  const handleStatusChange = async (newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}/status`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } });
      const updatedTask = { ...expandedTask, status: newStatus };
      setExpandedTask(updatedTask);
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
      toast.success(`Статус: ${STATUS_CONFIG[newStatus].label}`);
    } catch (err) { toast.error("Ошибка"); }
  };

  const handleDeleteTask = async () => {
    if(!confirm("Удалить задачу?")) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setExpandedTask(null); fetchTasks(); toast.info("Удалено");
    } catch (err) { toast.error("Ошибка"); }
  };

  const handleSaveEdit = async () => {
    try {
        const token = localStorage.getItem('token');
        await axios.put(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}`, { title: editTitle, description: editDesc }, { headers: { Authorization: `Bearer ${token}` } });
        const updatedTask = { ...expandedTask, title: editTitle, description: editDesc };
        setExpandedTask(updatedTask);
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
        setIsEditing(false); toast.success("Сохранено");
    } catch (err) { toast.error("Ошибка"); }
  };

  const sendComment = async () => {
    if(!newComment) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}/comments`, { content: newComment }, { headers: { Authorization: `Bearer ${token}` } });
      setNewComment("");
      const res = await axios.get(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}/comments`, { headers: { Authorization: `Bearer ${token}` } });
      setComments(res.data);
    } catch (err) { toast.error("Ошибка"); }
  };

  if (loadingDepts) return <div style={{padding: 20}}>Загрузка...</div>;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 40px)', gap: '20px' }}>

      {/* ЛЕВОЕ МЕНЮ */}
      <div className="card" style={{ width: '250px', padding: '20px', height: 'fit-content' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Users size={20} color="#3b82f6"/> Отделы</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {departments.map(dept => (
                <button key={dept.id} onClick={() => { setActiveDept(dept.name); setExpandedTask(null); }}
                    style={{ padding: '12px', textAlign: 'left', border: 'none', borderRadius: '8px', cursor: 'pointer', background: activeDept === dept.name ? '#eff6ff' : 'transparent', color: activeDept === dept.name ? '#2563eb' : '#64748b', fontWeight: activeDept === dept.name ? 600 : 400 }}>
                    {dept.name}
                </button>
            ))}
        </div>
      </div>

      {/* СПИСОК ЗАДАЧ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{activeDept}</h2>
            <button className="btn" onClick={() => setShowModal(true)}><Plus size={18} style={{ marginRight: '5px' }} /> Новая задача</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', overflowY: 'auto', paddingBottom: '20px' }}>
            {tasks.length === 0 && <p style={{color: '#94a3b8'}}>Задач нет.</p>}
            {tasks.map(task => {
                const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG['Open'];
                const StatusIcon = statusInfo.icon;
                return (
                    <div key={task.id} className="card" style={{ padding: '20px', cursor: 'pointer', border: '1px solid #e2e8f0', borderLeft: `4px solid ${statusInfo.color}`, transition: 'all 0.2s' }} onClick={() => openTask(task)}>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '10px'}}>
                            <div style={{color: '#64748b'}}><span style={{fontWeight: 600}}>{task.author_name}</span> <span style={{marginLeft: '5px', background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px'}}>{task.author_dept}</span></div>
                            <div style={{ color: statusInfo.color, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}><StatusIcon size={12} /> {statusInfo.label}</div>
                        </div>
                        <h3 style={{margin: '0 0 10px 0', fontSize: '16px', color: task.status === 'Done' ? '#94a3b8' : '#0f172a', textDecoration: task.status === 'Done' ? 'line-through' : 'none'}}>{task.title}</h3>
                        <p style={{color: '#475569', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{task.description}</p>
                    </div>
                );
            })}
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ */}
      {expandedTask && (
          <div className="card" style={{ width: '400px', display: 'flex', flexDirection: 'column', height: '100%', padding: '0', overflow: 'hidden', borderLeft: '1px solid #e2e8f0' }}>

            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
                    <select value={expandedTask.status || 'Open'} onChange={(e) => handleStatusChange(e.target.value)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                        <option value="Open">🔵 Новая</option><option value="In Progress">🟡 В работе</option><option value="Done">🟢 Выполнено</option>
                    </select>
                    <div style={{display: 'flex', gap: '5px'}}>
                        {!isEditing ? (
                            <>
                                <button onClick={() => setIsEditing(true)} className="icon-btn"><Edit2 size={18} color="#64748b"/></button>
                                <button onClick={handleDeleteTask} className="icon-btn"><Trash2 size={18} color="#ef4444"/></button>
                            </>
                        ) : (
                            <>
                                <button onClick={handleSaveEdit} className="icon-btn"><Save size={18} color="#10b981"/></button>
                                <button onClick={() => setIsEditing(false)} className="icon-btn"><X size={18} color="#64748b"/></button>
                            </>
                        )}
                        <button onClick={() => setExpandedTask(null)} className="icon-btn" style={{marginLeft: '10px'}}><X size={20}/></button>
                    </div>
                </div>
                {isEditing ? <input className="text-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} /> : <h3 style={{margin: 0, fontSize: '18px'}}>{expandedTask.title}</h3>}
                {!isEditing && <div style={{fontSize: '13px', color: '#64748b', marginTop: '5px'}}>Автор: <b>{expandedTask.author_name}</b> <span style={{background:'#e2e8f0', padding:'2px 5px', borderRadius:'4px'}}>{expandedTask.author_dept}</span></div>}
            </div>

            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {isEditing ? <textarea className="text-input" style={{height: '150px'}} value={editDesc} onChange={e => setEditDesc(e.target.value)}/> : <p style={{whiteSpace: 'pre-wrap', color: '#334155'}}>{expandedTask.description}</p>}

                {/* --- СЕКЦИЯ ВЛОЖЕНИЙ --- */}
                <div style={{marginTop: '20px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                        <h4 style={{margin: 0, fontSize: '13px', color: '#94a3b8'}}>ВЛОЖЕНИЯ ({attachments.length})</h4>
                    </div>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
                        {attachments.length === 0 && <span style={{fontSize: '12px', color: '#cbd5e1'}}>Нет файлов</span>}
                        {attachments.map(file => (
                            <div key={file.id} style={{display: 'flex', alignItems: 'center', gap: '5px', background: '#f1f5f9', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e2e8f0'}}>
                                <FileText size={14} color="#64748b"/>
                                <span style={{maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{file.filename}</span>
                                <button onClick={() => handleDownloadFile(file)} style={{border:'none', background:'none', cursor:'pointer'}}><Download size={14} color="#3b82f6"/></button>
                                <button onClick={() => handleDeleteFile(file.id)} style={{border:'none', background:'none', cursor:'pointer'}}><X size={14} color="#ef4444"/></button>
                            </div>
                        ))}
                    </div>
                </div>

                <hr style={{ margin: '20px 0', border: '0', borderTop: '1px solid #e2e8f0' }} />

                <h4 style={{margin: '0 0 15px 0', fontSize: '14px', color: '#94a3b8'}}>КОММЕНТАРИИ</h4>
                <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                    {comments.map(c => (
                        <div key={c.id} style={{background: '#f1f5f9', padding: '12px', borderRadius: '8px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                                <span style={{fontWeight: 600, fontSize: '13px', color: '#0f172a'}}>{c.username}</span>
                                <span style={{fontSize: '11px', color: '#64748b', background: 'white', padding: '1px 5px', borderRadius: '3px', border: '1px solid #e2e8f0'}}>{c.department}</span>
                            </div>
                            <div style={{fontSize: '14px', color: '#334155'}}>{c.content}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ padding: '15px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
                <label className="btn" style={{padding: '0 10px', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#64748b'}}>
                    <Paperclip size={18} />
                    <input type="file" hidden onChange={handleFileUpload} />
                </label>
                <input className="text-input" placeholder="Написать ответ..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} style={{marginBottom: 0}} />
                <button className="btn" onClick={sendComment} style={{padding: '0 12px'}}><Send size={18}/></button>
            </div>
          </div>
      )}

      {/* МОДАЛКА СОЗДАНИЯ (С ЗАГРУЗКОЙ ФАЙЛА) */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div className="card" style={{width: '500px', padding: '30px'}}>
                <h2>Новая задача в {activeDept}</h2>
                <div style={{marginBottom: '15px'}}>
                    <input className="text-input" placeholder="Заголовок" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} />
                </div>
                <div style={{marginBottom: '15px'}}>
                    <textarea className="text-input" placeholder="Описание..." style={{height: '100px', fontFamily: 'inherit'}} value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} />
                </div>

                {/* Поле выбора файла */}
                <div style={{marginBottom: '20px'}}>
                    <label className="btn" style={{width: '100%', justifyContent: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#64748b', cursor: 'pointer'}}>
                        <Paperclip size={16} style={{marginRight: '8px'}}/>
                        {newTaskFile ? newTaskFile.name : "Прикрепить файл (необязательно)"}
                        <input type="file" hidden onChange={e => setNewTaskFile(e.target.files[0])} />
                    </label>
                </div>

                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                    <button className="btn" style={{background: '#e2e8f0', color: 'black'}} onClick={() => setShowModal(false)}>Отмена</button>
                    <button className="btn" onClick={handleCreateTask}>Создать</button>
                </div>
            </div>
        </div>
      )}

      <style>{`.icon-btn { background: transparent; border: none; cursor: pointer; padding: 5px; border-radius: 4px; display: flex; alignItems: center; justify-content: center; } .icon-btn:hover { background: #e2e8f0; }`}</style>
    </div>
  );
};

export default DepartmentsPage;