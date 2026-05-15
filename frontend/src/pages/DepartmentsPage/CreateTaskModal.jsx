import React from "react";
import { Paperclip } from "lucide-react";

const CreateTaskModal = ({
  activeDept, departments, usersForModal,
  receiverType, setReceiverType,
  targetDeptForNewTask, setTargetDeptForNewTask,
  targetUserIdForNewTask, setTargetUserIdForNewTask,
  newTaskDueDate, setNewTaskDueDate,
  newTaskPriority, setNewTaskPriority,
  newTaskTitle, setNewTaskTitle,
  newTaskDesc, setNewTaskDesc,
  newTaskFile, setNewTaskFile,
  onSubmit, onCancel,
}) => {
  const labelStyle = { display: "block", fontSize: "13px", fontWeight: 600, color: "#64748b", marginBottom: "5px" };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
      <div className="card" style={{ width: "520px", padding: "30px" }}>
        <h2>Новая задача</h2>

        <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
          {["department", "user"].map((t) => (
            <button key={t} className="btn" onClick={() => setReceiverType(t)}
              style={{ background: receiverType === t ? "#eff6ff" : "#f1f5f9", color: receiverType === t ? "#2563eb" : "#475569", border: "1px solid #e2e8f0" }}>
              {t === "department" ? "Отдел" : "Пользователь"}
            </button>
          ))}
        </div>

        {receiverType === "department" ? (
          activeDept === "My Tasks" ? (
            <div style={{ marginBottom: "15px" }}>
              <label style={labelStyle}>Получатель (Отдел)</label>
              <select className="text-input" value={targetDeptForNewTask} onChange={(e) => setTargetDeptForNewTask(e.target.value)}>
                <option value="">-- Выберите отдел --</option>
                {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ marginBottom: "15px", fontSize: "13px", color: "#64748b" }}>
              Получатель (Отдел): <b style={{ color: "#0f172a" }}>{activeDept}</b>
            </div>
          )
        ) : (
          <div style={{ marginBottom: "15px" }}>
            <label style={labelStyle}>Получатель (Пользователь)</label>
            <select className="text-input" value={targetUserIdForNewTask} onChange={(e) => setTargetUserIdForNewTask(e.target.value)}>
              <option value="">-- Выберите пользователя --</option>
              {usersForModal.map((u) => <option key={u.id} value={u.id}>{u.username} — {u.department}</option>)}
            </select>
            {activeDept !== "My Tasks" && usersForModal.length === 0 && (
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>В отделе нет пользователей.</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Дедлайн</label>
            <input type="date" className="text-input" value={newTaskDueDate} onChange={(e) => setNewTaskDueDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Приоритет</label>
            <select className="text-input" value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)}>
              <option value="normal">Обычная</option>
              <option value="urgent">Срочно</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <input className="text-input" placeholder="Заголовок" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
        </div>

        <div style={{ marginBottom: "15px" }}>
          <textarea className="text-input" placeholder="Описание..." style={{ height: "100px", fontFamily: "inherit" }} value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label className="btn" style={{ width: "100%", justifyContent: "center", background: "#f8fafc", border: "1px dashed #cbd5e1", color: "#64748b", cursor: "pointer" }}>
            <Paperclip size={16} style={{ marginRight: "8px" }} />
            {newTaskFile ? newTaskFile.name : "Прикрепить файл (необязательно)"}
            <input type="file" hidden onChange={(e) => setNewTaskFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button className="btn" style={{ background: "#e2e8f0", color: "black" }} onClick={onCancel}>Отмена</button>
          <button className="btn" onClick={onSubmit}>Создать</button>
        </div>
      </div>
    </div>
  );
};

export default CreateTaskModal;
