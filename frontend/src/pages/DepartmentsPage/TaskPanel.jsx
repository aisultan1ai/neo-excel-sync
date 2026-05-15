import React from "react";
import { toast } from "react-toastify";
import axios from "axios";
import {
  X, Edit2, Trash2, Save, Paperclip, Send,
  FileText, Download, CheckCircle, User, Clock, AlertTriangle,
} from "lucide-react";
import { STATUS_CONFIG, formatYmdToRu } from "./helpers";
import { downloadAttachment, deleteAttachment, updateTaskStatus, updateTask, acceptTask, postComment, fetchTaskComments, fetchTaskAttachments } from "./api";

const TaskPanel = ({
  task, me, isEditing, editTitle, editDesc,
  comments, attachments, newComment,
  setIsEditing, setEditTitle, setEditDesc,
  setNewComment, setComments, setAttachments,
  setExpandedTask, setTasks, onDeleteClick,
}) => {
  const canManageTask = me && (me.is_admin || me.id === task.from_user_id);
  const canAcceptTask = me && task.status !== "Done" && !task.to_user_id && !task.accepted_by_user_id &&
    (me.is_admin || me.department === task.to_department);

  const handleStatusChange = async (newStatus) => {
    try {
      await updateTaskStatus(task.id, newStatus);
      const updated = { ...task, status: newStatus };
      setExpandedTask(updated);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast.success(`Статус: ${STATUS_CONFIG[newStatus].label}`);
    } catch { toast.error("Ошибка"); }
  };

  const handleSaveEdit = async () => {
    try {
      await updateTask(task.id, { title: editTitle, description: editDesc });
      const updated = { ...task, title: editTitle, description: editDesc };
      setExpandedTask(updated);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setIsEditing(false);
      toast.success("Сохранено");
    } catch (err) {
      if (err?.response?.status === 403) toast.error("Нет прав на редактирование");
      else toast.error("Ошибка");
    }
  };

  const handleAcceptTask = async () => {
    try {
      const res = await acceptTask(task.id);
      const updated = res?.task || null;
      if (updated) {
        setExpandedTask(updated);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success(`Принято: ${updated.accepted_by_name || "Вы"}`);
      }
    } catch (e) {
      if (e?.response?.status === 409) toast.error("Задача уже принята другим сотрудником");
      else if (e?.response?.status === 403) toast.error("Нет прав принимать эту задачу");
      else toast.error("Ошибка принятия");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post(`/api/v1/tasks/${task.id}/attachments`, formData);
      const res = await fetchTaskAttachments(task.id);
      setAttachments(res);
      toast.success("Файл загружен");
    } catch { toast.error("Ошибка загрузки"); }
    finally { e.target.value = ""; }
  };

  const handleDownloadFile = async (file) => {
    try {
      const blob = await downloadAttachment(file.id);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url; link.setAttribute("download", file.filename);
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Ошибка скачивания"); }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await deleteAttachment(fileId);
      setAttachments((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Файл удален");
    } catch (e) {
      if (e?.response?.status === 403) toast.error("Нет прав на удаление файла");
      else toast.error("Ошибка");
    }
  };

  const sendComment = async () => {
    if (!newComment) return;
    try {
      await postComment(task.id, newComment);
      setNewComment("");
      const res = await fetchTaskComments(task.id);
      setComments(res);
    } catch { toast.error("Ошибка"); }
  };

  return (
    <div className="card" style={{ width: "400px", display: "flex", flexDirection: "column", height: "100%", padding: "0", overflow: "hidden", borderLeft: "1px solid #e2e8f0" }}>
      {/* Header */}
      <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
          <select
            value={task.status || "Open"} onChange={(e) => handleStatusChange(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 600, color: "#334155", cursor: "pointer" }}
          >
            <option value="Open">🔵 Новая</option>
            <option value="In Progress">🟡 В работе</option>
            <option value="Done">🟢 Выполнено</option>
          </select>

          <div style={{ display: "flex", gap: "5px" }}>
            {!isEditing ? (
              <>
                {canManageTask && <button onClick={() => setIsEditing(true)} className="icon-btn" title="Редактировать"><Edit2 size={18} color="#64748b" /></button>}
                {canManageTask && <button onClick={onDeleteClick} className="icon-btn" title="Удалить задачу"><Trash2 size={18} color="#ef4444" /></button>}
                <button onClick={() => setExpandedTask(null)} className="icon-btn" style={{ marginLeft: "10px" }} title="Закрыть"><X size={20} /></button>
              </>
            ) : (
              <>
                <button onClick={handleSaveEdit} className="icon-btn" title="Сохранить"><Save size={18} color="#10b981" /></button>
                <button onClick={() => setIsEditing(false)} className="icon-btn" title="Отмена"><X size={18} color="#64748b" /></button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <input className="text-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        ) : (
          <h3 style={{ margin: 0, fontSize: "18px" }}>{task.title}</h3>
        )}

        {!isEditing && (
          <>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "6px" }}>
              Автор: <b>{task.author_name}</b>{" "}
              <span style={{ background: "#e2e8f0", padding: "2px 5px", borderRadius: "4px" }}>{task.author_dept}</span>
            </div>
            <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {task.priority === "urgent" && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#ef4444", background: "#fee2e2", padding: "3px 8px", borderRadius: "999px" }}>
                  <AlertTriangle size={12} /> Срочно
                </div>
              )}
              {task.due_date && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#334155", background: "#f1f5f9", padding: "3px 8px", borderRadius: "999px" }}>
                  <Clock size={12} /> Дедлайн: {formatYmdToRu(task.due_date)}
                </div>
              )}
              {task.to_user_id && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#0f172a", background: "#eff6ff", padding: "3px 8px", borderRadius: "999px", border: "1px solid #dbeafe" }}>
                  <User size={12} /> Назначено: {task.to_user_name}
                </div>
              )}
              {task.accepted_by_user_id && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#0f172a", background: "#ecfdf5", padding: "3px 8px", borderRadius: "999px", border: "1px solid #d1fae5" }}>
                  <CheckCircle size={12} /> Принял: {task.accepted_by_name}
                </div>
              )}
            </div>
            {canAcceptTask && (
              <button className="btn" onClick={handleAcceptTask} style={{ marginTop: "12px", background: "#3b82f6", width: "100%", justifyContent: "center" }}>
                <CheckCircle size={18} style={{ marginRight: 6 }} /> Принять задачу
              </button>
            )}
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "20px", flex: 1, overflowY: "auto" }}>
        {isEditing ? (
          <textarea className="text-input" style={{ height: "150px" }} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
        ) : (
          <p style={{ whiteSpace: "pre-wrap", color: "#334155" }}>{task.description}</p>
        )}

        <div style={{ marginTop: "20px" }}>
          <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#94a3b8" }}>ВЛОЖЕНИЯ ({attachments.length})</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {attachments.length === 0 && <span style={{ fontSize: "12px", color: "#cbd5e1" }}>Нет файлов</span>}
            {attachments.map((file) => (
              <div key={file.id} style={{ display: "flex", alignItems: "center", gap: "5px", background: "#f1f5f9", padding: "5px 10px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e2e8f0" }}>
                <FileText size={14} color="#64748b" />
                <span style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span>
                <button onClick={() => handleDownloadFile(file)} style={{ border: "none", background: "none", cursor: "pointer" }} title="Скачать">
                  <Download size={14} color="#3b82f6" />
                </button>
                {canManageTask && (
                  <button onClick={() => handleDeleteFile(file.id)} style={{ border: "none", background: "none", cursor: "pointer" }} title="Удалить файл">
                    <X size={14} color="#ef4444" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <hr style={{ margin: "20px 0", border: "0", borderTop: "1px solid #e2e8f0" }} />

        <h4 style={{ margin: "0 0 15px 0", fontSize: "14px", color: "#94a3b8" }}>КОММЕНТАРИИ</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {comments.map((c) => (
            <div key={c.id} style={{ background: "#f1f5f9", padding: "12px", borderRadius: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>{c.username}</span>
                <span style={{ fontSize: "11px", color: "#64748b", background: "white", padding: "1px 5px", borderRadius: "3px", border: "1px solid #e2e8f0" }}>{c.department}</span>
              </div>
              <div style={{ fontSize: "14px", color: "#334155" }}>{c.content}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ padding: "15px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "10px" }}>
        <label className="btn" style={{ padding: "0 10px", cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#64748b" }} title="Прикрепить файл">
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
  );
};

export default TaskPanel;
