import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
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

const STATUS_CONFIG = {
  Open: { label: "Новая", color: "#64748b", bg: "#f1f5f9", icon: Circle },
  "In Progress": { label: "В работе", color: "#3b82f6", bg: "#eff6ff", icon: Clock },
  Done: { label: "Выполнено", color: "#10b981", bg: "#ecfdf5", icon: CheckCircle },
};

const formatYmdToRu = (ymd) => {
  if (!ymd || typeof ymd !== "string") return "";
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
};

const DepartmentsPage = () => {
  const [departments, setDepartments] = useState([]);
  const [activeDept, setActiveDept] = useState("My Tasks");
  const [tasks, setTasks] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(true);

  // current user
  const [me, setMe] = useState(null);

  // users list for "assign to user"
  const [users, setUsers] = useState([]);

  // --- CREATE TASK ---
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskFile, setNewTaskFile] = useState(null);

  // receiver: department or user
  const [receiverType, setReceiverType] = useState("department"); // department | user
  const [targetDeptForNewTask, setTargetDeptForNewTask] = useState("");
  const [targetUserIdForNewTask, setTargetUserIdForNewTask] = useState("");

  // due date + priority
  const [newTaskDueDate, setNewTaskDueDate] = useState(""); // YYYY-MM-DD
  const [newTaskPriority, setNewTaskPriority] = useState("normal"); // normal | urgent

  // --- VIEW / EDIT ---
  const [expandedTask, setExpandedTask] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [attachments, setAttachments] = useState([]);

  // --- DELETE CONFIRMATION STATE ---
  const [showDeleteTaskConfirm, setShowDeleteTaskConfirm] = useState(false);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState(false);
  const [fileToDeleteId, setFileToDeleteId] = useState(null);

  // API helpers

  const fetchMe = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMe(res.data); // { id, username, department, is_admin, ... }
    } catch (e) {
      setMe(null);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setUsers([]);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await axios.get("/api/departments");
      setDepartments(res.data);
    } catch (err) {
      // ignore
    } finally {
      setLoadingDepts(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem("token");
      const url = activeDept === "My Tasks" ? "/api/my-tasks" : `/api/tasks/${activeDept}`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setTasks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("request failed", err);
    }
  };

  // initial load
  useEffect(() => {
    fetchDepartments();
    fetchMe();
    fetchUsers();
  }, []);

  // load tasks on dept change
  useEffect(() => {
    if (activeDept) fetchTasks();
  }, [activeDept]);

  // rights: only author or admin
  const canManageTask = useMemo(() => {
    return me && expandedTask && (me.is_admin || me.id === expandedTask.from_user_id);
  }, [me, expandedTask]);

  const canAcceptTask = useMemo(() => {
    if (!me || !expandedTask) return false;
    if (expandedTask.status === "Done") return false;
    if (expandedTask.to_user_id) return false; // assigned to specific user -> no "accept"
    if (expandedTask.accepted_by_user_id) return false; // already accepted
    // must be same department (or admin)
    return me.is_admin || me.department === expandedTask.to_department;
  }, [me, expandedTask]);

  const usersForModal = useMemo(() => {
    // if user is looking at a specific department, we can filter users by that dept (handy)
    if (activeDept !== "My Tasks") {
      return users.filter((u) => u.department === activeDept);
    }
    return users;
  }, [users, activeDept]);

  // actions
  const resetCreateModal = () => {
    setShowModal(false);
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskFile(null);
    setTargetDeptForNewTask("");
    setTargetUserIdForNewTask("");
    setReceiverType("department");
    setNewTaskDueDate("");
    setNewTaskPriority("normal");
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle) return toast.error("Введите заголовок");

    let to_department = "";
    let to_user_id = null;

    if (receiverType === "user") {
      if (!targetUserIdForNewTask) return toast.error("Выберите пользователя");
      const u = users.find((x) => String(x.id) === String(targetUserIdForNewTask));
      if (!u) return toast.error("Пользователь не найден");
      to_user_id = u.id;
      to_department = u.department; // чтобы задача была видна отделу
    } else {
      // department
      const deptToSend = activeDept === "My Tasks" ? targetDeptForNewTask : activeDept;
      if (!deptToSend) return toast.error("Выберите отдел получатель");
      to_department = deptToSend;
    }

    try {
      const token = localStorage.getItem("token");
      const taskRes = await axios.post(
        "/api/tasks",
        {
          title: newTaskTitle,
          description: newTaskDesc,
          to_department,
          to_user_id,
          due_date: newTaskDueDate || null,
          priority: newTaskPriority || "normal",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const newTaskId = taskRes.data.id;

      if (newTaskFile && newTaskId) {
        const formData = new FormData();
        formData.append("file", newTaskFile);
        await axios.post(`/api/tasks/${newTaskId}/attachments`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      toast.success("Задача создана!");
      resetCreateModal();
      fetchTasks();
    } catch (err) {
      toast.error("Ошибка создания задачи");
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
      const token = localStorage.getItem("token");
      const [resComments, resFiles] = await Promise.all([
        axios.get(`/api/tasks/${task.id}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`/api/tasks/${task.id}/attachments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setComments(Array.isArray(resComments.data) ? resComments.data : []);
      setAttachments(Array.isArray(resFiles.data) ? resFiles.data : []);
    } catch (err) {
      console.error("request failed", err);
    }
  };

  const handleAcceptTask = async () => {
    if (!expandedTask) return;

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `/api/tasks/${expandedTask.id}/accept`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

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
  };

  // anyone can upload files
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !expandedTask) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("token");
      await axios.post(`/api/tasks/${expandedTask.id}/attachments`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await axios.get(`/api/tasks/${expandedTask.id}/attachments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAttachments(Array.isArray(res.data) ? res.data : []);
      toast.success("Файл загружен");
    } catch (e2) {
      toast.error("Ошибка загрузки");
    } finally {

      e.target.value = "";
    }
  };

  const handleDownloadFile = async (file) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`/api/attachments/${file.id}`, {
        responseType: "blob",
        headers: { Authorization: `Bearer ${token}` },
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Ошибка скачивания");
    }
  };

  const openDeleteFileModal = (id) => {
    setFileToDeleteId(id);
    setShowDeleteFileConfirm(true);
  };

  const executeDeleteFile = async () => {
    if (!fileToDeleteId) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/attachments/${fileToDeleteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAttachments((prev) => prev.filter((f) => f.id !== fileToDeleteId));
      toast.success("Файл удален");
    } catch (e) {
      if (e?.response?.status === 403) toast.error("Нет прав на удаление файла");
      else toast.error("Ошибка");
    } finally {
      setShowDeleteFileConfirm(false);
      setFileToDeleteId(null);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `/api/tasks/${expandedTask.id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updatedTask = { ...expandedTask, status: newStatus };
      setExpandedTask(updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      toast.success(`Статус: ${STATUS_CONFIG[newStatus].label}`);
    } catch (err) {
      toast.error("Ошибка");
    }
  };

  const openDeleteTaskModal = () => setShowDeleteTaskConfirm(true);

  const executeDeleteTask = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/tasks/${expandedTask.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setExpandedTask(null);
      fetchTasks();
      toast.info("Удалено");
    } catch (err) {
      if (err?.response?.status === 403) toast.error("Нет прав на удаление задачи");
      else toast.error("Ошибка");
    } finally {
      setShowDeleteTaskConfirm(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `/api/tasks/${expandedTask.id}`,
        { title: editTitle, description: editDesc },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedTask = { ...expandedTask, title: editTitle, description: editDesc };
      setExpandedTask(updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      setIsEditing(false);
      toast.success("Сохранено");
    } catch (err) {
      if (err?.response?.status === 403) toast.error("Нет прав на редактирование");
      else toast.error("Ошибка");
    }
  };

  const sendComment = async () => {
    if (!newComment || !expandedTask) return;

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `/api/tasks/${expandedTask.id}/comments`,
        { content: newComment },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewComment("");
      const res = await axios.get(`/api/tasks/${expandedTask.id}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error("Ошибка");
    }
  };

  if (loadingDepts) return <div style={{ padding: 20 }}>Загрузка...</div>;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 40px)", gap: "20px" }}>
      {/* ЛЕВОЕ МЕНЮ */}
      <div className="card" style={{ width: "250px", padding: "20px", height: "fit-content" }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "10px" }}>
          <Users size={20} color="#3b82f6" /> Отделы
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={() => {
              setActiveDept("My Tasks");
              setExpandedTask(null);
            }}
            style={{
              padding: "12px",
              textAlign: "left",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              background: activeDept === "My Tasks" ? "#eff6ff" : "transparent",
              color: activeDept === "My Tasks" ? "#2563eb" : "#64748b",
              fontWeight: activeDept === "My Tasks" ? 600 : 400,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderBottom: "1px solid #e2e8f0",
            }}
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
              style={{
                padding: "12px",
                textAlign: "left",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                background: activeDept === dept.name ? "#eff6ff" : "transparent",
                color: activeDept === dept.name ? "#2563eb" : "#64748b",
                fontWeight: activeDept === dept.name ? 600 : 400,
              }}
            >
              {dept.name}
            </button>
          ))}
        </div>
      </div>

      {/* СПИСОК ЗАДАЧ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{activeDept === "My Tasks" ? "Мои задачи (Созданные мной)" : activeDept}</h2>
          <button className="btn" onClick={() => setShowModal(true)}>
            <Plus size={18} style={{ marginRight: "5px" }} /> Новая задача
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "20px",
            overflowY: "auto",
            paddingBottom: "20px",
          }}
        >
          {tasks.length === 0 && <p style={{ color: "#94a3b8" }}>Задач нет.</p>}

          {tasks.map((task) => {
            const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG["Open"];
            const StatusIcon = statusInfo.icon;

            return (
              <div
                key={task.id}
                className="card"
                style={{
                  padding: "20px",
                  cursor: "pointer",
                  border: "1px solid #e2e8f0",
                  borderLeft: `4px solid ${statusInfo.color}`,
                  transition: "all 0.2s",
                }}
                onClick={() => openTask(task)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    marginBottom: "10px",
                    gap: "10px",
                  }}
                >
                  <div style={{ color: "#64748b" }}>
                    {activeDept === "My Tasks" ? (
                      <>
                        To:{" "}
                        <span style={{ fontWeight: 600, color: "#3b82f6" }}>
                          {task.to_user_id ? `👤 ${task.to_user_name}` : task.to_department}
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: 600 }}>{task.author_name}</span>{" "}
                        <span
                          style={{
                            marginLeft: "5px",
                            background: "#f1f5f9",
                            padding: "2px 5px",
                            borderRadius: "4px",
                          }}
                        >
                          {task.author_dept}
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      color: statusInfo.color,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    <StatusIcon size={12} /> {statusInfo.label}
                  </div>
                </div>

                <h3
                  style={{
                    margin: "0 0 10px 0",
                    fontSize: "16px",
                    color: task.status === "Done" ? "#94a3b8" : "#0f172a",
                    textDecoration: task.status === "Done" ? "line-through" : "none",
                  }}
                >
                  {task.title}
                </h3>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                  {task.priority === "urgent" && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#ef4444",
                        background: "#fee2e2",
                        padding: "3px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      <AlertTriangle size={12} /> Срочно
                    </div>
                  )}

                  {task.due_date && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#334155",
                        background: "#f1f5f9",
                        padding: "3px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      <Clock size={12} /> Дедлайн: {formatYmdToRu(task.due_date)}
                    </div>
                  )}

                  {task.accepted_by_user_id && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#0f172a",
                        background: "#ecfdf5",
                        padding: "3px 8px",
                        borderRadius: "999px",
                        border: "1px solid #d1fae5",
                      }}
                    >
                      <CheckCircle size={12} /> Принял: {task.accepted_by_name}
                    </div>
                  )}
                </div>

                <p
                  style={{
                    color: "#475569",
                    fontSize: "13px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {task.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ */}
      {expandedTask && (
        <div
          className="card"
          style={{
            width: "400px",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: "0",
            overflow: "hidden",
            borderLeft: "1px solid #e2e8f0",
          }}
        >
          <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
              <select
                value={expandedTask.status || "Open"}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                <option value="Open">🔵 Новая</option>
                <option value="In Progress">🟡 В работе</option>
                <option value="Done">🟢 Выполнено</option>
              </select>

              <div style={{ display: "flex", gap: "5px" }}>
                {!isEditing ? (
                  <>
                    {/* EDIT только автор/админ */}
                    {canManageTask && (
                      <button onClick={() => setIsEditing(true)} className="icon-btn" title="Редактировать">
                        <Edit2 size={18} color="#64748b" />
                      </button>
                    )}

                    {/* DELETE только автор/админ */}
                    {canManageTask && (
                      <button onClick={openDeleteTaskModal} className="icon-btn" title="Удалить задачу">
                        <Trash2 size={18} color="#ef4444" />
                      </button>
                    )}

                    <button
                      onClick={() => setExpandedTask(null)}
                      className="icon-btn"
                      style={{ marginLeft: "10px" }}
                      title="Закрыть"
                    >
                      <X size={20} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleSaveEdit} className="icon-btn" title="Сохранить">
                      <Save size={18} color="#10b981" />
                    </button>

                    <button onClick={() => setIsEditing(false)} className="icon-btn" title="Отмена">
                      <X size={18} color="#64748b" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditing ? (
              <input className="text-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            ) : (
              <h3 style={{ margin: 0, fontSize: "18px" }}>{expandedTask.title}</h3>
            )}

            {!isEditing && (
              <>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "6px" }}>
                  Автор: <b>{expandedTask.author_name}</b>{" "}
                  <span style={{ background: "#e2e8f0", padding: "2px 5px", borderRadius: "4px" }}>
                    {expandedTask.author_dept}
                  </span>
                </div>

                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {expandedTask.priority === "urgent" && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#ef4444",
                        background: "#fee2e2",
                        padding: "3px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      <AlertTriangle size={12} /> Срочно
                    </div>
                  )}

                  {expandedTask.due_date && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#334155",
                        background: "#f1f5f9",
                        padding: "3px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      <Clock size={12} /> Дедлайн: {formatYmdToRu(expandedTask.due_date)}
                    </div>
                  )}

                  {expandedTask.to_user_id && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#0f172a",
                        background: "#eff6ff",
                        padding: "3px 8px",
                        borderRadius: "999px",
                        border: "1px solid #dbeafe",
                      }}
                    >
                      <User size={12} /> Назначено: {expandedTask.to_user_name}
                    </div>
                  )}

                  {expandedTask.accepted_by_user_id && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#0f172a",
                        background: "#ecfdf5",
                        padding: "3px 8px",
                        borderRadius: "999px",
                        border: "1px solid #d1fae5",
                      }}
                    >
                      <CheckCircle size={12} /> Принял: {expandedTask.accepted_by_name}
                    </div>
                  )}
                </div>

                {canAcceptTask && (
                  <button
                    className="btn"
                    onClick={handleAcceptTask}
                    style={{
                      marginTop: "12px",
                      background: "#3b82f6",
                      width: "100%",
                      justifyContent: "center",
                    }}
                    title="Принять задачу"
                  >
                    <CheckCircle size={18} style={{ marginRight: 6 }} />
                    Принять задачу
                  </button>
                )}
              </>
            )}
          </div>

          <div style={{ padding: "20px", flex: 1, overflowY: "auto" }}>
            {isEditing ? (
              <textarea
                className="text-input"
                style={{ height: "150px" }}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            ) : (
              <p style={{ whiteSpace: "pre-wrap", color: "#334155" }}>{expandedTask.description}</p>
            )}

            <div style={{ marginTop: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <h4 style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
                  ВЛОЖЕНИЯ ({attachments.length})
                </h4>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {attachments.length === 0 && (
                  <span style={{ fontSize: "12px", color: "#cbd5e1" }}>Нет файлов</span>
                )}

                {attachments.map((file) => (
                  <div
                    key={file.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "#f1f5f9",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <FileText size={14} color="#64748b" />
                    <span
                      style={{
                        maxWidth: "150px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.filename}
                    </span>

                    <button
                      onClick={() => handleDownloadFile(file)}
                      style={{ border: "none", background: "none", cursor: "pointer" }}
                      title="Скачать"
                    >
                      <Download size={14} color="#3b82f6" />
                    </button>

                    {/* Удаление файла только автор/админ */}
                    {canManageTask && (
                      <button
                        onClick={() => openDeleteFileModal(file.id)}
                        style={{ border: "none", background: "none", cursor: "pointer" }}
                        title="Удалить файл"
                      >
                        <X size={14} color="#ef4444" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <hr style={{ margin: "20px 0", border: "0", borderTop: "1px solid #e2e8f0" }} />

            <h4 style={{ margin: "0 0 15px 0", fontSize: "14px", color: "#94a3b8" }}>
              КОММЕНТАРИИ
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {comments.map((c) => (
                <div key={c.id} style={{ background: "#f1f5f9", padding: "12px", borderRadius: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>{c.username}</span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#64748b",
                        background: "white",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {c.department}
                    </span>
                  </div>
                  <div style={{ fontSize: "14px", color: "#334155" }}>{c.content}</div>
                </div>
              ))}
            </div>
          </div>

          {/* bottom bar */}
          <div
            style={{
              padding: "15px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              gap: "10px",
            }}
          >
            {/* Upload доступен всем */}
            <label
              className="btn"
              style={{
                padding: "0 10px",
                cursor: "pointer",
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                color: "#64748b",
              }}
              title="Прикрепить файл"
            >
              <Paperclip size={18} />
              <input type="file" hidden onChange={handleFileUpload} />
            </label>

            <input
              className="text-input"
              placeholder="Написать ответ..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendComment()}
              style={{ marginBottom: 0 }}
            />

            <button className="btn" onClick={sendComment} style={{ padding: "0 12px" }}>
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* МОДАЛКА СОЗДАНИЯ */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ width: "520px", padding: "30px" }}>
            <h2>Новая задача</h2>

            {/* receiver toggle */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
              <button
                className="btn"
                onClick={() => setReceiverType("department")}
                style={{
                  background: receiverType === "department" ? "#eff6ff" : "#f1f5f9",
                  color: receiverType === "department" ? "#2563eb" : "#475569",
                  border: "1px solid #e2e8f0",
                }}
              >
                Отдел
              </button>
              <button
                className="btn"
                onClick={() => setReceiverType("user")}
                style={{
                  background: receiverType === "user" ? "#eff6ff" : "#f1f5f9",
                  color: receiverType === "user" ? "#2563eb" : "#475569",
                  border: "1px solid #e2e8f0",
                }}
              >
                Пользователь
              </button>
            </div>

            {/* receiver fields */}
            {receiverType === "department" ? (
              <>
                {activeDept === "My Tasks" ? (
                  <div style={{ marginBottom: "15px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: "5px",
                      }}
                    >
                      Получатель (Отдел)
                    </label>
                    <select
                      className="text-input"
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
                  <div style={{ marginBottom: "15px", fontSize: "13px", color: "#64748b" }}>
                    Получатель (Отдел):{" "}
                    <b style={{ color: "#0f172a" }}>{activeDept}</b>
                  </div>
                )}
              </>
            ) : (
              <div style={{ marginBottom: "15px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#64748b",
                    marginBottom: "5px",
                  }}
                >
                  Получатель (Пользователь)
                </label>
                <select
                  className="text-input"
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
                {activeDept !== "My Tasks" && usersForModal.length === 0 && (
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
                    В отделе нет пользователей (или список пользователей не загрузился).
                  </div>
                )}
              </div>
            )}

            {/* due date + priority */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#64748b",
                    marginBottom: "5px",
                  }}
                >
                  Дедлайн
                </label>
                <input
                  type="date"
                  className="text-input"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#64748b",
                    marginBottom: "5px",
                  }}
                >
                  Приоритет
                </label>
                <select
                  className="text-input"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                >
                  <option value="normal">Обычная</option>
                  <option value="urgent">Срочно</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "15px" }}>
              <input
                className="text-input"
                placeholder="Заголовок"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: "15px" }}>
              <textarea
                className="text-input"
                placeholder="Описание..."
                style={{ height: "100px", fontFamily: "inherit" }}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                className="btn"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  color: "#64748b",
                  cursor: "pointer",
                }}
                title="Прикрепить файл"
              >
                <Paperclip size={16} style={{ marginRight: "8px" }} />{" "}
                {newTaskFile ? newTaskFile.name : "Прикрепить файл (необязательно)"}
                <input type="file" hidden onChange={(e) => setNewTaskFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                className="btn"
                style={{ background: "#e2e8f0", color: "black" }}
                onClick={resetCreateModal}
              >
                Отмена
              </button>
              <button className="btn" onClick={handleCreateTask}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА УДАЛЕНИЯ ЗАДАЧИ --- */}
      {showDeleteTaskConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            className="card"
            style={{
              width: "400px",
              padding: "30px",
              textAlign: "center",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                margin: "0 auto 20px auto",
                width: "60px",
                height: "60px",
                background: "#fee2e2",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={32} color="#ef4444" />
            </div>
            <h3 style={{ margin: "0 0 10px 0", fontSize: "20px", color: "#1f2937" }}>
              Удалить задачу?
            </h3>
            <p
              style={{
                color: "#6b7280",
                fontSize: "14px",
                marginBottom: "25px",
                lineHeight: "1.5",
              }}
            >
              Вы уверены, что хотите удалить эту задачу безвозвратно?
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                className="btn"
                onClick={() => setShowDeleteTaskConfirm(false)}
                style={{ background: "white", color: "#374151", border: "1px solid #d1d5db" }}
              >
                Отмена
              </button>
              <button
                className="btn"
                onClick={executeDeleteTask}
                style={{ background: "#ef4444", color: "white", border: "none" }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА УДАЛЕНИЯ ФАЙЛА --- */}
      {showDeleteFileConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            className="card"
            style={{
              width: "400px",
              padding: "30px",
              textAlign: "center",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                margin: "0 auto 20px auto",
                width: "60px",
                height: "60px",
                background: "#fee2e2",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={32} color="#ef4444" />
            </div>
            <h3 style={{ margin: "0 0 10px 0", fontSize: "20px", color: "#1f2937" }}>
              Удалить файл?
            </h3>
            <p
              style={{
                color: "#6b7280",
                fontSize: "14px",
                marginBottom: "25px",
                lineHeight: "1.5",
              }}
            >
              Вы уверены, что хотите удалить этот файл из задачи?
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                className="btn"
                onClick={() => setShowDeleteFileConfirm(false)}
                style={{ background: "white", color: "#374151", border: "1px solid #d1d5db" }}
              >
                Отмена
              </button>
              <button
                className="btn"
                onClick={executeDeleteFile}
                style={{ background: "#ef4444", color: "white", border: "none" }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .icon-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 5px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon-btn:hover { background: #e2e8f0; }
      `}</style>
    </div>
  );
};

export default DepartmentsPage;
