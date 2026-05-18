import React from "react";

const CreateUserModal = ({ newUser, setNewUser, departments, onSave, onClose }) => (
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
        <button className="btn" style={{ background: "#e2e8f0", color: "black" }} onClick={onClose}>Отмена</button>
        <button className="btn" onClick={onSave}>Создать</button>
      </div>
    </div>
  </div>
);

export default CreateUserModal;
