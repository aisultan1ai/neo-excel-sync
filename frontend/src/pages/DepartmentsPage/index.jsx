import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { AlertTriangle, Plus, User, Users } from "lucide-react";

import {
  fetchMe, fetchUsers, fetchDepartments, fetchTasks,
  createTask, uploadTaskAttachment,
  fetchTaskComments, fetchTaskAttachments, deleteTask,
} from "./api";
import TaskCard from "./TaskCard";
import TaskPanel from "./TaskPanel";
import CreateTaskModal from "./CreateTaskModal";

const ConfirmDeleteModal = ({ message, onConfirm, onCancel }) => (
  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000, backdropFilter: "blur(3px)" }}>
    <div className="card" style={{ width: "400px", padding: "30px", textAlign: "center", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
      <div style={{ margin: "0 auto 20px auto", width: "60px", height: "60px", background: "#fee2e2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AlertTriangle size={32} color="#ef4444" />
      </div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: "20px", color: "#1f2937" }}>Подтверждение</h3>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "25px", lineHeight: "1.5" }}>{message}</p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
        <button className="btn" onClick={onCancel} style={{ background: "white", color: "#374151", border: "1px solid #d1d5db" }}>Отмена</button>
        <button className="btn" onClick={onConfirm} style={{ background: "#ef4444", color: "white", border: "none" }}>Удалить</button>
      </div>
    </div>
  </div>
);

const DepartmentsPage = () => {
  const [departments, setDepartments] = useState([]);
  const [activeDept, setActiveDept] = useState("My Tasks");
  const [tasks, setTasks] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
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

  useEffect(() => {
    Promise.all([
      fetchMe().then(setMe).catch(() => setMe(null)),
      fetchUsers().then(setUsers).catch(() => setUsers([])),
      fetchDepartments().then((d) => { setDepartments(d); setLoadingDepts(false); }).catch(() => setLoadingDepts(false)),
    ]);
  }, []);

  useEffect(() => {
    if (activeDept) fetchTasks(activeDept).then(setTasks).catch(() => {});
  }, [activeDept]);

  const usersForModal = useMemo(() => {
    if (activeDept !== "My Tasks") return users.filter((u) => u.department === activeDept);
    return users;
  }, [users, activeDept]);

  const resetCreateModal = () => {
    setShowModal(false);
    setNewTaskTitle(""); setNewTaskDesc(""); setNewTaskFile(null);
    setTargetDeptForNewTask(""); setTargetUserIdForNewTask("");
    setReceiverType("department"); setNewTaskDueDate(""); setNewTaskPriority("normal");
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
      to_department = u.department;
    } else {
      const deptToSend = activeDept === "My Tasks" ? targetDeptForNewTask : activeDept;
      if (!deptToSend) return toast.error("Выберите отдел получатель");
      to_department = deptToSend;
    }

    try {
      const taskData = await createTask({ title: newTaskTitle, description: newTaskDesc, to_department, to_user_id, due_date: newTaskDueDate || null, priority: newTaskPriority || "normal" });
      if (newTaskFile && taskData.id) {
        await uploadTaskAttachment(taskData.id, newTaskFile);
      }
      toast.success("Задача создана!");
      resetCreateModal();
      fetchTasks(activeDept).then(setTasks).catch(() => {});
    } catch { toast.error("Ошибка создания задачи"); }
  };

  const openTask = async (task) => {
    setExpandedTask(task);
    setIsEditing(false);
    setEditTitle(task.title);
    setEditDesc(task.description);
    setComments([]); setAttachments([]);
    try {
      const [c, a] = await Promise.all([fetchTaskComments(task.id), fetchTaskAttachments(task.id)]);
      setComments(c); setAttachments(a);
    } catch { /* ignore fetch error, UI shows empty state */ }
  };

  const executeDeleteTask = async () => {
    try {
      await deleteTask(expandedTask.id);
      setExpandedTask(null);
      fetchTasks(activeDept).then(setTasks).catch(() => {});
      toast.info("Удалено");
    } catch (err) {
      if (err?.response?.status === 403) toast.error("Нет прав на удаление задачи");
      else toast.error("Ошибка");
    } finally { setShowDeleteTaskConfirm(false); }
  };

  if (loadingDepts) return <div style={{ padding: 20 }}>Загрузка...</div>;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 40px)", gap: "20px" }}>
      {/* Left nav */}
      <div className="card" style={{ width: "250px", padding: "20px", height: "fit-content" }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "10px" }}>
          <Users size={20} color="#3b82f6" /> Отделы
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={() => { setActiveDept("My Tasks"); setExpandedTask(null); }}
            style={{ padding: "12px", textAlign: "left", border: "none", borderRadius: "8px", cursor: "pointer", background: activeDept === "My Tasks" ? "#eff6ff" : "transparent", color: activeDept === "My Tasks" ? "#2563eb" : "#64748b", fontWeight: activeDept === "My Tasks" ? 600 : 400, display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #e2e8f0" }}
          >
            <User size={18} /> Мои задачи
          </button>
          {departments.map((dept) => (
            <button key={dept.id} onClick={() => { setActiveDept(dept.name); setExpandedTask(null); }}
              style={{ padding: "12px", textAlign: "left", border: "none", borderRadius: "8px", cursor: "pointer", background: activeDept === dept.name ? "#eff6ff" : "transparent", color: activeDept === dept.name ? "#2563eb" : "#64748b", fontWeight: activeDept === dept.name ? 600 : 400 }}>
              {dept.name}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{activeDept === "My Tasks" ? "Мои задачи (Созданные мной)" : activeDept}</h2>
          <button className="btn" onClick={() => setShowModal(true)}>
            <Plus size={18} style={{ marginRight: "5px" }} /> Новая задача
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px", overflowY: "auto", paddingBottom: "20px" }}>
          {tasks.length === 0 && <p style={{ color: "#94a3b8" }}>Задач нет.</p>}
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} activeDept={activeDept} onClick={openTask} />
          ))}
        </div>
      </div>

      {/* Task detail panel */}
      {expandedTask && (
        <TaskPanel
          task={expandedTask} me={me}
          isEditing={isEditing} editTitle={editTitle} editDesc={editDesc}
          comments={comments} attachments={attachments} newComment={newComment}
          setIsEditing={setIsEditing} setEditTitle={setEditTitle} setEditDesc={setEditDesc}
          setNewComment={setNewComment} setComments={setComments} setAttachments={setAttachments}
          setExpandedTask={setExpandedTask} setTasks={setTasks}
          onDeleteClick={() => setShowDeleteTaskConfirm(true)}
        />
      )}

      {showModal && (
        <CreateTaskModal
          activeDept={activeDept} departments={departments} usersForModal={usersForModal}
          receiverType={receiverType} setReceiverType={setReceiverType}
          targetDeptForNewTask={targetDeptForNewTask} setTargetDeptForNewTask={setTargetDeptForNewTask}
          targetUserIdForNewTask={targetUserIdForNewTask} setTargetUserIdForNewTask={setTargetUserIdForNewTask}
          newTaskDueDate={newTaskDueDate} setNewTaskDueDate={setNewTaskDueDate}
          newTaskPriority={newTaskPriority} setNewTaskPriority={setNewTaskPriority}
          newTaskTitle={newTaskTitle} setNewTaskTitle={setNewTaskTitle}
          newTaskDesc={newTaskDesc} setNewTaskDesc={setNewTaskDesc}
          newTaskFile={newTaskFile} setNewTaskFile={setNewTaskFile}
          onSubmit={handleCreateTask} onCancel={resetCreateModal}
        />
      )}

      {showDeleteTaskConfirm && (
        <ConfirmDeleteModal
          message="Вы уверены, что хотите удалить эту задачу безвозвратно?"
          onConfirm={executeDeleteTask}
          onCancel={() => setShowDeleteTaskConfirm(false)}
        />
      )}

      <style>{`
        .icon-btn { background: transparent; border: none; cursor: pointer; padding: 5px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
        .icon-btn:hover { background: #e2e8f0; }
      `}</style>
    </div>
  );
};

export default DepartmentsPage;
