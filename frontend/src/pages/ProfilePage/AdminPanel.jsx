import React, { useState } from "react";
import { User, Building2, UserPlus, Trash2, Edit2, Plus, Check, X } from "lucide-react";

const AdminPanel = ({ profile, users, departments, onCreateUser, onDeleteUser, onAddDept, onDeleteDept, onRenameDept }) => {
  const [tab, setTab] = useState("users");
  const [newDeptName, setNewDeptName] = useState("");
  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", department: departments[0]?.name || "Back Office", is_admin: false });

  const tabBtnStyle = (active) => ({
    flex: 1, padding: "15px", background: active ? "white" : "#f8fafc", border: "none", cursor: "pointer",
    fontWeight: 600, color: active ? "#dc2626" : "#64748b", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
  });

  return (
    <div className="card" style={{ borderTop: "5px solid #dc2626", padding: "0" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
        <button onClick={() => setTab("users")} style={tabBtnStyle(tab === "users")}><User size={18} /> Пользователи</button>
        <button onClick={() => setTab("depts")} style={tabBtnStyle(tab === "depts")}><Building2 size={18} /> Отделы</button>
      </div>

      {tab === "users" && (
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "15px" }}>
            <button className="btn" onClick={() => { setShowCreateModal(true); setNewUser({ username: "", password: "", department: departments[0]?.name || "", is_admin: false }); }}>
              <UserPlus size={18} style={{ marginRight: "8px" }} /> Добавить
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>Логин</th>
                <th style={{ padding: "10px" }}>Отдел</th>
                <th style={{ padding: "10px" }}>Роль</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px", fontWeight: 600 }}>{u.username}</td>
                  <td style={{ padding: "10px" }}>{u.department}</td>
                  <td style={{ padding: "10px" }}>{u.is_admin ? <b style={{ color: "#dc2626" }}>Admin</b> : "User"}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    {u.id !== profile.id && (
                      <button onClick={() => onDeleteUser(u.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "depts" && (
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", background: "#f8fafc", padding: "15px", borderRadius: "8px" }}>
            <input className="text-input" style={{ marginBottom: 0 }} placeholder="Название нового отдела" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} />
            <button className="btn" onClick={() => { onAddDept(newDeptName); setNewDeptName(""); }} disabled={!newDeptName}>
              <Plus size={18} /> Добавить
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "15px" }}>
            {departments.map((d) => (
              <div key={d.id} style={{ border: "1px solid #e2e8f0", padding: "15px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {editingDept === d.id ? (
                  <div style={{ display: "flex", gap: "5px", width: "100%" }}>
                    <input value={editDeptName} onChange={(e) => setEditDeptName(e.target.value)} style={{ padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", width: "100%" }} />
                    <button onClick={() => { onRenameDept(editingDept, editDeptName); setEditingDept(null); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#10b981" }}><Check size={18} /></button>
                    <button onClick={() => setEditingDept(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#64748b" }}><X size={18} /></button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontWeight: 600, color: "#334155" }}>{d.name}</span>
                    <div style={{ display: "flex", gap: "5px" }}>
                      <button onClick={() => { setEditingDept(d.id); setEditDeptName(d.name); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#3b82f6" }}><Edit2 size={16} /></button>
                      <button onClick={() => onDeleteDept(d.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444" }}><Trash2 size={16} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 999 }}>
          <div className="card" style={{ width: "400px", padding: "30px" }}>
            <h3 style={{ marginTop: 0 }}>Новый пользователь</h3>
            <div className="input-group">
              <label>Логин</label>
              <input className="text-input" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Пароль</label>
              <input className="text-input" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Отдел</label>
              <select className="text-input" value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}>
                {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <input type="checkbox" checked={newUser.is_admin} onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })} />
              <label>Права Администратора</label>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn" style={{ background: "#e2e8f0", color: "black" }} onClick={() => setShowCreateModal(false)}>Отмена</button>
              <button className="btn" onClick={() => { onCreateUser(newUser); setShowCreateModal(false); }}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
