import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, Plus, MessageSquare, Send, Trash2, Edit2,
  CheckCircle, Clock, Circle, Save, X
} from 'lucide-react';
import { toast } from 'react-toastify';

// Цвета для статусов
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

  // Состояния для модалки и задач
  const [showModal, setShowModal] = useState(false);

  // Создание
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  // Просмотр / Редактирование
  const [expandedTask, setExpandedTask] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Комментарии
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");

  // 1. ЗАГРУЗКА ОТДЕЛОВ ПРИ СТАРТЕ
  useEffect(() => {
    fetchDepartments();
  }, []);

  // 2. ЗАГРУЗКА ЗАДАЧ ПРИ СМЕНЕ ОТДЕЛА
  useEffect(() => {
    if (activeDept) {
        fetchTasks();
    }
  }, [activeDept]);

  const fetchDepartments = async () => {
    try {
        const res = await axios.get('http://127.0.0.1:8000/api/departments');
        setDepartments(res.data);
        if (res.data.length > 0) {
            setActiveDept(res.data[0].name); // Делаем первый отдел активным
        }
        setLoadingDepts(false);
    } catch (err) {
        console.error("Ошибка загрузки отделов", err);
        setLoadingDepts(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`http://127.0.0.1:8000/api/tasks/${activeDept}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTasks(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // --- СОЗДАНИЕ ---
  const handleCreateTask = async () => {
    if (!newTaskTitle) {
        toast.error("Введите заголовок");
        return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://127.0.0.1:8000/api/tasks', {
        title: newTaskTitle,
        description: newTaskDesc,
        to_department: activeDept
      }, { headers: { Authorization: `Bearer ${token}` } });

      toast.success("Задача создана!");
      setShowModal(false);
      setNewTaskTitle("");
      setNewTaskDesc("");
      fetchTasks();
    } catch (err) {
      toast.error("Ошибка создания задачи");
    }
  };

  // --- ОТКРЫТИЕ ЗАДАЧИ ---
  const openTask = async (task) => {
    setExpandedTask(task);
    setIsEditing(false);
    setEditTitle(task.title);
    setEditDesc(task.description);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`http://127.0.0.1:8000/api/tasks/${task.id}/comments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setComments(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // --- СМЕНА СТАТУСА ---
  const handleStatusChange = async (newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedTask = { ...expandedTask, status: newStatus };
      setExpandedTask(updatedTask);
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
      toast.success(`Статус изменен: ${STATUS_CONFIG[newStatus].label}`);
    } catch (err) {
      toast.error("Ошибка смены статуса");
    }
  };

  // --- УДАЛЕНИЕ ---
  const handleDeleteTask = async () => {
    if(!window.confirm("Вы уверены, что хотите удалить эту задачу?")) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setExpandedTask(null);
      fetchTasks();
      toast.info("Задача удалена");
    } catch (err) {
      toast.error("Не удалось удалить задачу");
    }
  };

  // --- СОХРАНЕНИЕ РЕДАКТИРОВАНИЯ ---
  const handleSaveEdit = async () => {
    try {
        const token = localStorage.getItem('token');
        await axios.put(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}`, {
            title: editTitle,
            description: editDesc
        }, { headers: { Authorization: `Bearer ${token}` } });

        const updatedTask = { ...expandedTask, title: editTitle, description: editDesc };
        setExpandedTask(updatedTask);
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
        setIsEditing(false);
        toast.success("Изменения сохранены");
    } catch (err) {
        toast.error("Ошибка сохранения");
    }
  };

  const sendComment = async () => {
    if(!newComment) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://127.0.0.1:8000/api/tasks/${expandedTask.id}/comments`, {
        content: newComment
      }, { headers: { Authorization: `Bearer ${token}` } });

      setNewComment("");
      openTask(expandedTask);
    } catch (err) {
      toast.error("Ошибка отправки");
    }
  };

  if (loadingDepts) return <div style={{padding: 20}}>Загрузка отделов...</div>;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 40px)', gap: '20px' }}>

      {/* ЛЕВОЕ МЕНЮ (СПИСОК ОТДЕЛОВ) */}
      <div className="card" style={{ width: '250px', padding: '20px', height: 'fit-content' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={20} color="#3b82f6"/> Отделы
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {departments.length === 0 && <p style={{fontSize:'13px', color:'#94a3b8'}}>Нет отделов</p>}

            {departments.map(dept => (
                <button
                    key={dept.id}
                    onClick={() => { setActiveDept(dept.name); setExpandedTask(null); }}
                    style={{
                        padding: '12px', textAlign: 'left', border: 'none', borderRadius: '8px', cursor: 'pointer',
                        background: activeDept === dept.name ? '#eff6ff' : 'transparent',
                        color: activeDept === dept.name ? '#2563eb' : '#64748b',
                        fontWeight: activeDept === dept.name ? 600 : 400
                    }}
                >
                    {dept.name}
                </button>
            ))}
        </div>
      </div>

      {/* СПИСОК ЗАДАЧ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{activeDept}</h2>
            <button className="btn" onClick={() => setShowModal(true)}>
                <Plus size={18} style={{ marginRight: '5px' }} /> Новая задача
            </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', overflowY: 'auto', paddingBottom: '20px' }}>
            {tasks.length === 0 && <p style={{color: '#94a3b8'}}>Задач нет. Будьте первыми!</p>}

            {tasks.map(task => {
                const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG['Open'];
                const StatusIcon = statusInfo.icon;

                return (
                    <div
                        key={task.id}
                        className="card"
                        style={{
                            padding: '20px', cursor: 'pointer', border: '1px solid #e2e8f0',
                            borderLeft: `4px solid ${statusInfo.color}`,
                            transition: 'all 0.2s'
                        }}
                        onClick={() => openTask(task)}
                        onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                        onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                    >
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '10px'}}>
                            <div style={{color: '#64748b'}}>
                                <span style={{fontWeight: 600}}>{task.author_name}</span>
                                <span style={{marginLeft: '5px', background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px'}}>{task.author_dept}</span>
                            </div>
                            <div style={{ color: statusInfo.color, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                <StatusIcon size={12} /> {statusInfo.label}
                            </div>
                        </div>

                        <h3 style={{margin: '0 0 10px 0', fontSize: '16px', color: task.status === 'Done' ? '#94a3b8' : '#0f172a', textDecoration: task.status === 'Done' ? 'line-through' : 'none'}}>
                            {task.title}
                        </h3>
                        <p style={{color: '#475569', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                            {task.description}
                        </p>
                    </div>
                );
            })}
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ (ДЕТАЛИ) */}
      {expandedTask && (
          <div className="card" style={{ width: '400px', display: 'flex', flexDirection: 'column', height: '100%', padding: '0', overflow: 'hidden', borderLeft: '1px solid #e2e8f0' }}>

            {/* Шапка панели */}
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
                    {/* Выбор статуса */}
                    <select
                        value={expandedTask.status || 'Open'}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        style={{
                            padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                            fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer'
                        }}
                    >
                        <option value="Open">🔵 Новая</option>
                        <option value="In Progress">🟡 В работе</option>
                        <option value="Done">🟢 Выполнено</option>
                    </select>

                    {/* Кнопки действий */}
                    <div style={{display: 'flex', gap: '5px'}}>
                        {!isEditing ? (
                            <>
                                <button onClick={() => setIsEditing(true)} className="icon-btn" title="Редактировать"><Edit2 size={18} color="#64748b"/></button>
                                <button onClick={handleDeleteTask} className="icon-btn" title="Удалить"><Trash2 size={18} color="#ef4444"/></button>
                            </>
                        ) : (
                            <>
                                <button onClick={handleSaveEdit} className="icon-btn" title="Сохранить"><Save size={18} color="#10b981"/></button>
                                <button onClick={() => setIsEditing(false)} className="icon-btn" title="Отмена"><X size={18} color="#64748b"/></button>
                            </>
                        )}
                        <button onClick={() => setExpandedTask(null)} className="icon-btn" style={{marginLeft: '10px'}}><X size={20}/></button>
                    </div>
                </div>

                {/* Заголовок (или поле ввода) */}
                {isEditing ? (
                    <input className="text-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                ) : (
                    <h3 style={{margin: 0, fontSize: '18px'}}>{expandedTask.title}</h3>
                )}

                {!isEditing && (
                    <div style={{fontSize: '13px', color: '#64748b', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '5px'}}>
                        Автор: <b>{expandedTask.author_name}</b> <span style={{background:'#e2e8f0', padding:'2px 5px', borderRadius:'4px'}}>{expandedTask.author_dept}</span>
                    </div>
                )}
            </div>

            {/* Тело задачи */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {isEditing ? (
                    <textarea
                        className="text-input"
                        style={{height: '150px', fontFamily: 'inherit'}}
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                    />
                ) : (
                    <p style={{whiteSpace: 'pre-wrap', color: '#334155', lineHeight: '1.5'}}>{expandedTask.description}</p>
                )}

                <hr style={{ margin: '20px 0', border: '0', borderTop: '1px solid #e2e8f0' }} />

                <h4 style={{margin: '0 0 15px 0', fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px'}}>Комментарии</h4>
                <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                    {comments.map(c => (
                        <div key={c.id} style={{background: '#f1f5f9', padding: '12px', borderRadius: '8px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                                <span style={{fontWeight: 600, fontSize: '13px', color: '#0f172a'}}>{c.username}</span>
                                <span style={{fontSize: '11px', color: '#64748b', background: 'white', padding: '1px 5px', borderRadius: '3px', border: '1px solid #e2e8f0'}}>
                                    {c.department}
                                </span>
                            </div>
                            <div style={{fontSize: '14px', color: '#334155'}}>{c.content}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ padding: '15px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
                <input
                    className="text-input"
                    placeholder="Написать ответ..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendComment()}
                    style={{marginBottom: 0}}
                />
                <button className="btn" onClick={sendComment} style={{padding: '0 12px'}}><Send size={18}/></button>
            </div>
          </div>
      )}

      {/* МОДАЛКА СОЗДАНИЯ ЗАДАЧИ */}
      {showModal && (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div className="card" style={{width: '500px', padding: '30px'}}>
                <h2>Новая задача в {activeDept}</h2>
                <input
                    className="text-input"
                    placeholder="Заголовок"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                />
                <textarea
                    className="text-input"
                    placeholder="Описание..."
                    style={{height: '100px', fontFamily: 'inherit'}}
                    value={newTaskDesc}
                    onChange={e => setNewTaskDesc(e.target.value)}
                />
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px'}}>
                    <button className="btn" style={{background: '#e2e8f0', color: 'black'}} onClick={() => setShowModal(false)}>Отмена</button>
                    <button className="btn" onClick={handleCreateTask}>Создать</button>
                </div>
            </div>
        </div>
      )}

      {/* Стили для кнопок-иконок */}
      <style>{`
        .icon-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 5px;
            border-radius: 4px;
            display: flex; alignItems: center; justify-content: center;
        }
        .icon-btn:hover { background: #e2e8f0; }
      `}</style>
    </div>
  );
};

export default DepartmentsPage;