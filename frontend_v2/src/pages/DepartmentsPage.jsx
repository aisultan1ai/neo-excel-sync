import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  Plus,
  Send,
  Trash2,
  Edit2,
  CheckCircle,
  Clock,
  Circle,
  Save,
  X,
  Paperclip,
  FileText,
  Download,
  User,
  AlertTriangle,
} from "lucide-react";
import { toast } from "react-toastify";

import { api } from "../api/client";

const STATUS_CONFIG = {
  Open: { label: "Новая", color: "#64748b", bg: "#f1f5f9", icon: Circle },
  "In Progress": { label: "В работе", color: "#3b82f6", bg: "#eff6ff", icon: Clock },
  Done: { label: "Выполнено", color: "#10b981", bg: "#ecfdf5", icon: CheckCircle },
  Cancelled: { label: "Отменено", color: "#ef4444", bg: "#fee2e2", icon: AlertTriangle },
};

const formatYmdToRu = (ymd) => {
  if (!ymd || typeof ymd !== "string") return "";
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [activeDept, setActiveDept] = useState("My Tasks");
  const [tasks, setTasks] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskFile, setNewTaskFile] = useState(null);

  const [receiverType, setReceiverType] = useState("department");
  const [targetDeptForNewTask, setTargetDeptForNewTask] = useState("");
  const [targetUserIdForNewTask, setTargetUserIdForNewTask] = useState("");

  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("normal");

  const [expandedTask, setExpandedTask] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [attachments, setAttachments] = useState([]);

  const [showDeleteTaskConfirm, setShowDeleteTaskConfirm] = useState(false);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState(false);
  const [fileToDeleteId, setFileToDeleteId] = useState(null);

  async function fetchMe() {
    try {
      const res = await api.get("/api/v2/profile");
      setMe(res.data);
    } catch {
      setMe(null);
    }
  }

  async function fetchUsers() {
    try {
      const res = await api.get("/api/v2/users");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsers([]);
    }
  }

  async function fetchDepartments() {
    try {
      const res = await api.get("/api/v2/departments");
      setDepartments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setDepartments([]);
    } finally {
      setLoadingDepts(false);
    }
  }

  async function fetchTasks() {
    try {
      setLoadingTasks(true);
      const url =
        activeDept === "My Tasks"
          ? "/api/v2/my-tasks"
          : `/api/v2/tasks/department/${encodeURIComponent(activeDept)}`;

      const res = await api.get(url);
      setTasks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error("Ошибка загрузки задач");
    } finally {
      setLoadingTasks(false);
    }
  }

  useEffect(() => {
    fetchDepartments();
    fetchMe();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeDept) fetchTasks();
  }, [activeDept]);

  const canManageTask = useMemo(() => {
    return me && expandedTask && (me.is_admin || me.id === expandedTask.from_user_id);
  }, [me, expandedTask]);

  const canAcceptTask = useMemo(() => {
    if (!me || !expandedTask) return false;
    if (expandedTask.status === "Done" || expandedTask.status === "Cancelled") return false;
    if (expandedTask.to_user_id) return false;
    if (expandedTask.accepted_by_user_id) return false;
    return me.is_admin || me.department === expandedTask.to_department;
  }, [me, expandedTask]);

  const usersForModal = useMemo(() => {
    if (activeDept !== "My Tasks") {
      return users.filter((u) => u.department === activeDept);
    }
    return users;
  }, [users, activeDept]);

  function resetCreateModal() {
    setShowModal(false);
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskFile(null);
    setTargetDeptForNewTask("");
    setTargetUserIdForNewTask("");
    setReceiverType("department");
    setNewTaskDueDate("");
    setNewTaskPriority("normal");
  }

  async function handleCreateTask() {
    if (!newTaskTitle.trim()) return toast.error("Введите заголовок");

    let to_department = "";
    let to_user_id = null;

    if (receiverType === "user") {
      if (!targetUserIdForNewTask) return toast.error("Выберите пользователя");
      const u = users.find((x) => String(x.id) === String(targetUserIdForNewTask));
      if (!u) return toast.error("Пользователь не найден");
      to_user_id = u.id;
      to_department = u.department;
    } else {
      const deptToSend = activeDept === "My Tasks" ? targetDeptForNewTask : activeDept;
      if (!deptToSend) return toast.error("Выберите отдел получатель");
      to_department = deptToSend;
    }

    try {
      const taskRes = await api.post("/api/v2/tasks", {
        title: newTaskTitle,
        description: newTaskDesc,
        to_department,
        to_user_id,
        due_date: newTaskDueDate || null,
        priority: newTaskPriority || "normal",
      });

      const newTaskId = taskRes.data?.task?.id;

      if (newTaskFile && newTaskId) {
        const formData = new FormData();
        formData.append("file", newTaskFile);

        await api.post(`/api/v2/tasks/${newTaskId}/attachments`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      toast.success("Задача создана");
      resetCreateModal();
      fetchTasks();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.detail || "Ошибка создания задачи");
    }
  }

  async function openTask(task) {
    setExpandedTask(task);
    setIsEditing(false);
    setEditTitle(task.title);
    setEditDesc(task.description);
    setComments([]);
    setAttachments([]);

    try {
      const [resComments, resFiles, resTask] = await Promise.all([
        api.get(`/api/v2/tasks/${task.id}/comments`),
        api.get(`/api/v2/tasks/${task.id}/attachments`),
        api.get(`/api/v2/tasks/${task.id}`),
      ]);

      setComments(Array.isArray(resComments.data) ? resComments.data : []);
      setAttachments(Array.isArray(resFiles.data) ? resFiles.data : []);
      setExpandedTask(resTask.data || task);
    } catch (err) {
      console.error(err);
      toast.error("Ошибка загрузки задачи");
    }
  }

  async function handleAcceptTask() {
    if (!expandedTask) return;

    try {
      const res = await api.post(`/api/v2/tasks/${expandedTask.id}/accept`, {});
      const updated = res.data?.task || null;

      if (updated) {
        setExpandedTask(updated);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success(`Принято: ${updated.accepted_by_name || "Вы"}`);
      } else {
        fetchTasks();
      }
    } catch (e) {
      if (e?.response?.status === 409) toast.error("Задача уже принята другим сотрудником");
      else if (e?.response?.status === 403) toast.error("Нет прав принимать эту задачу");
      else toast.error("Ошибка принятия");
      fetchTasks();
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !expandedTask) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post(`/api/v2/tasks/${expandedTask.id}/attachments`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const res = await api.get(`/api/v2/tasks/${expandedTask.id}/attachments`);
      setAttachments(Array.isArray(res.data) ? res.data : []);
      toast.success("Файл загружен");
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      e.target.value = "";
    }
  }

  async function handleDownloadFile(file) {
    try {
      const res = await api.get(`/api/v2/tasks/attachments/${file.id}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Ошибка скачивания");
    }
  }

  function openDeleteFileModal(id) {
    setFileToDeleteId(id);
    setShowDeleteFileConfirm(true);
  }

  async function executeDeleteFile() {
    if (!fileToDeleteId) return;

    try {
      await api.delete(`/api/v2/tasks/attachments/${fileToDeleteId}`);
      setAttachments((prev) => prev.filter((f) => f.id !== fileToDeleteId));
      toast.success("Файл удален");
    } catch (e) {
      if (e?.response?.status === 403) toast.error("Нет прав на удаление файла");
      else toast.error("Ошибка");
    } finally {
      setShowDeleteFileConfirm(false);
      setFileToDeleteId(null);
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      await api.put(`/api/v2/tasks/${expandedTask.id}/status`, { status: newStatus });

      const updatedTask = { ...expandedTask, status: newStatus };
      setExpandedTask(updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      toast.success(`Статус: ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
    } catch {
      toast.error("Ошибка");
    }
  }

  function openDeleteTaskModal() {
    setShowDeleteTaskConfirm(true);
  }

  async function executeDeleteTask() {
    try {
      await api.delete(`/api/v2/tasks/${expandedTask.id}`);
      setExpandedTask(null);
      fetchTasks();
      toast.info("Удалено");
    } catch (err) {
      if (err?.response?.status === 403) toast.error("Нет прав на удаление задачи");
      else toast.error("Ошибка");
    } finally {
      setShowDeleteTaskConfirm(false);
    }
  }

  async function handleSaveEdit() {
    try {
      const res = await api.put(`/api/v2/tasks/${expandedTask.id}`, {
        title: editTitle,
        description: editDesc,
      });

      const updatedTask = res.data?.task
        ? { ...expandedTask, ...res.data.task, title: editTitle, description: editDesc }
        : { ...expandedTask, title: editTitle, description: editDesc };

      setExpandedTask(updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      setIsEditing(false);
      toast.success("Сохранено");
    } catch (err) {
      if (err?.response?.status === 403) toast.error("Нет прав на редактирование");
      else toast.error("Ошибка");
    }
  }

  async function sendComment() {
    if (!newComment.trim() || !expandedTask) return;

    try {
      await api.post(`/api/v2/tasks/${expandedTask.id}/comments`, {
        content: newComment,
      });

      setNewComment("");

      const res = await api.get(`/api/v2/tasks/${expandedTask.id}/comments`);
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Ошибка");
    }
  }

  if (loadingDepts) return <div className="page"><div className="card">Загрузка...</div></div>;

  return (
    <div className="page departments-page">
      <div className="departments-shell">
        <div className="card departments-sidebar">
          <h3 className="departments-sidebar-title">
            <Users size={20} color="#3b82f6" /> Отделы
          </h3>

          <div className="departments-list">
            <button
              onClick={() => {
                setActiveDept("My Tasks");
                setExpandedTask(null);
              }}
              className={`departments-nav-btn ${activeDept === "My Tasks" ? "active" : ""}`}
            >
              <User size={18} /> Мои задачи
            </button>

            {departments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => {
                  setActiveDept(dept.name);
                  setExpandedTask(null);
                }}
                className={`departments-nav-btn ${activeDept === dept.name ? "active" : ""}`}
              >
                {dept.name}
              </button>
            ))}
          </div>
        </div>

        <div className="departments-main">
          <div className="departments-main-head">
            <h2>{activeDept === "My Tasks" ? "Мои задачи (Созданные мной)" : activeDept}</h2>

            <button className="save-btn" onClick={() => setShowModal(true)} type="button">
              <Plus size={18} />
              <span>Новая задача</span>
            </button>
          </div>

          <div className="departments-task-grid">
            {loadingTasks && <p className="departments-muted">Загрузка задач...</p>}
            {!loadingTasks && tasks.length === 0 && <p className="departments-muted">Задач нет.</p>}

            {tasks.map((task) => {
              const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG.Open;
              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={task.id}
                  className="card departments-task-card"
                  style={{ borderLeft: `4px solid ${statusInfo.color}` }}
                  onClick={() => openTask(task)}
                >
                  <div className="departments-task-top">
                    <div className="departments-task-author">
                      {activeDept === "My Tasks" ? (
                        <>
                          To:{" "}
                          <span className="departments-highlight">
                            {task.to_user_id ? `👤 ${task.to_user_name}` : task.to_department}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="departments-bold">{task.author_name}</span>{" "}
                          <span className="departments-badge">{task.author_dept}</span>
                        </>
                      )}
                    </div>

                    <div
                      className="departments-task-status"
                      style={{ color: statusInfo.color }}
                    >
                      <StatusIcon size={12} /> {statusInfo.label}
                    </div>
                  </div>

                  <h3
                    className="departments-task-title"
                    style={{
                      color: task.status === "Done" ? "#94a3b8" : "#0f172a",
                      textDecoration: task.status === "Done" ? "line-through" : "none",
                    }}
                  >
                    {task.title}
                  </h3>

                  <div className="departments-task-tags">
                    {task.priority === "urgent" && (
                      <div className="departments-tag urgent">
                        <AlertTriangle size={12} /> Срочно
                      </div>
                    )}

                    {task.due_date && (
                      <div className="departments-tag neutral">
                        <Clock size={12} /> Дедлайн: {formatYmdToRu(task.due_date)}
                      </div>
                    )}

                    {task.accepted_by_user_id && (
                      <div className="departments-tag success">
                        <CheckCircle size={12} /> Принял: {task.accepted_by_name}
                      </div>
                    )}
                  </div>

                  <p className="departments-task-desc">{task.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {expandedTask && (
          <div className="card departments-drawer">
            <div className="departments-drawer-head">
              <div className="departments-drawer-toprow">
                <select
                  value={expandedTask.status || "Open"}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="departments-status-select"
                >
                  <option value="Open">🔵 Новая</option>
                  <option value="In Progress">🟡 В работе</option>
                  <option value="Done">🟢 Выполнено</option>
                  <option value="Cancelled">🔴 Отменено</option>
                </select>

                <div className="departments-drawer-actions">
                  {!isEditing ? (
                    <>
                      {canManageTask && (
                        <button onClick={() => setIsEditing(true)} className="icon-btn" type="button">
                          <Edit2 size={18} color="#64748b" />
                        </button>
                      )}

                      {canManageTask && (
                        <button onClick={openDeleteTaskModal} className="icon-btn danger" type="button">
                          <Trash2 size={18} color="#ef4444" />
                        </button>
                      )}

                      <button
                        onClick={() => setExpandedTask(null)}
                        className="icon-btn"
                        type="button"
                      >
                        <X size={20} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleSaveEdit} className="icon-btn" type="button">
                        <Save size={18} color="#10b981" />
                      </button>

                      <button onClick={() => setIsEditing(false)} className="icon-btn" type="button">
                        <X size={18} color="#64748b" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="departments-edit-input"
                />
              ) : (
                <h3 className="departments-drawer-title">{expandedTask.title}</h3>
              )}

              {!isEditing && (
                <>
                  <div className="departments-meta-line">
                    Автор: <b>{expandedTask.author_name}</b>{" "}
                    <span className="departments-badge">{expandedTask.author_dept}</span>
                  </div>

                  <div className="departments-task-tags">
                    {expandedTask.priority === "urgent" && (
                      <div className="departments-tag urgent">
                        <AlertTriangle size={12} /> Срочно
                      </div>
                    )}

                    {expandedTask.due_date && (
                      <div className="departments-tag neutral">
                        <Clock size={12} /> Дедлайн: {formatYmdToRu(expandedTask.due_date)}
                      </div>
                    )}

                    {expandedTask.to_user_id && (
                      <div className="departments-tag info">
                        <User size={12} /> Назначено: {expandedTask.to_user_name}
                      </div>
                    )}

                    {expandedTask.accepted_by_user_id && (
                      <div className="departments-tag success">
                        <CheckCircle size={12} /> Принял: {expandedTask.accepted_by_name}
                      </div>
                    )}
                  </div>

                  {canAcceptTask && (
                    <button className="save-btn departments-accept-btn" onClick={handleAcceptTask} type="button">
                      <CheckCircle size={18} />
                      <span>Принять задачу</span>
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="departments-drawer-body">
              {isEditing ? (
                <textarea
                  className="departments-edit-textarea"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              ) : (
                <p className="departments-description">{expandedTask.description}</p>
              )}

              <div className="departments-section">
                <div className="departments-section-title">Вложения ({attachments.length})</div>

                <div className="departments-attachments">
                  {attachments.length === 0 && <span className="departments-empty-hint">Нет файлов</span>}

                  {attachments.map((file) => (
                    <div key={file.id} className="departments-attachment-chip">
                      <FileText size={14} color="#64748b" />
                      <span className="departments-attachment-name">{file.filename}</span>

                      <button onClick={() => handleDownloadFile(file)} className="icon-btn" type="button">
                        <Download size={14} color="#3b82f6" />
                      </button>

                      {canManageTask && (
                        <button
                          onClick={() => openDeleteFileModal(file.id)}
                          className="icon-btn danger"
                          type="button"
                        >
                          <X size={14} color="#ef4444" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <hr className="departments-divider" />

              <h4 className="departments-section-title">Комментарии</h4>

              <div className="departments-comments-list">
                {comments.map((c) => (
                  <div key={c.id} className="departments-comment-card">
                    <div className="departments-comment-head">
                      <span className="departments-bold">{c.username}</span>
                      <span className="departments-badge">{c.department}</span>
                    </div>
                    <div className="departments-comment-text">{c.content}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="departments-drawer-footer">
              <label className="secondary-btn departments-attach-btn">
                <Paperclip size={18} />
                <input type="file" hidden onChange={handleFileUpload} />
              </label>

              <input
                placeholder="Написать ответ..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendComment()}
                className="departments-comment-input"
              />

              <button className="save-btn" onClick={sendComment} type="button">
                <Send size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="card departments-modal">
            <h2>Новая задача</h2>

            <div className="departments-toggle-row">
              <button
                className={`departments-toggle-btn ${receiverType === "department" ? "active" : ""}`}
                onClick={() => setReceiverType("department")}
                type="button"
              >
                Отдел
              </button>
              <button
                className={`departments-toggle-btn ${receiverType === "user" ? "active" : ""}`}
                onClick={() => setReceiverType("user")}
                type="button"
              >
                Пользователь
              </button>
            </div>

            {receiverType === "department" ? (
              <>
                {activeDept === "My Tasks" ? (
                  <div className="form-group">
                    <label>Получатель (Отдел)</label>
                    <select
                      value={targetDeptForNewTask}
                      onChange={(e) => setTargetDeptForNewTask(e.target.value)}
                    >
                      <option value="">-- Выберите отдел --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="departments-inline-note">
                    Получатель (Отдел): <b>{activeDept}</b>
                  </div>
                )}
              </>
            ) : (
              <div className="form-group">
                <label>Получатель (Пользователь)</label>
                <select
                  value={targetUserIdForNewTask}
                  onChange={(e) => setTargetUserIdForNewTask(e.target.value)}
                >
                  <option value="">-- Выберите пользователя --</option>
                  {usersForModal.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} — {u.department}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="departments-create-grid">
              <div className="form-group">
                <label>Дедлайн</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Приоритет</label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                >
                  <option value="normal">Обычная</option>
                  <option value="urgent">Срочно</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <input
                placeholder="Заголовок"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <textarea
                placeholder="Описание..."
                rows={5}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="secondary-btn departments-file-pick">
                <Paperclip size={16} />
                <span>{newTaskFile ? newTaskFile.name : "Прикрепить файл (необязательно)"}</span>
                <input type="file" hidden onChange={(e) => setNewTaskFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={resetCreateModal} type="button">
                Отмена
              </button>
              <button className="save-btn" onClick={handleCreateTask} type="button">
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteTaskConfirm && (
        <div className="modal-backdrop">
          <div className="card departments-confirm-modal">
            <div className="departments-confirm-icon">
              <AlertTriangle size={32} color="#ef4444" />
            </div>

            <h3>Удалить задачу?</h3>
            <p>Вы уверены, что хотите удалить эту задачу безвозвратно?</p>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowDeleteTaskConfirm(false)} type="button">
                Отмена
              </button>
              <button className="save-btn" onClick={executeDeleteTask} type="button" style={{ background: "#ef4444", borderColor: "#ef4444" }}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteFileConfirm && (
        <div className="modal-backdrop">
          <div className="card departments-confirm-modal">
            <div className="departments-confirm-icon">
              <AlertTriangle size={32} color="#ef4444" />
            </div>

            <h3>Удалить файл?</h3>
            <p>Вы уверены, что хотите удалить этот файл из задачи?</p>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowDeleteFileConfirm(false)} type="button">
                Отмена
              </button>
              <button className="save-btn" onClick={executeDeleteFile} type="button" style={{ background: "#ef4444", borderColor: "#ef4444" }}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}