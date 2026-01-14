import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  User,
  Shield,
  Key,
  BarChart3,
  Briefcase,
  Trash2,
  UserPlus,
  Check,
  X,
  Building2,
  Edit2,
  Plus,
  LogOut,
} from "lucide-react";
import { toast } from "react-toastify";

const ProfilePage = ({ onLogout }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Смена пароля
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  // АДМИНКА
  const [adminTab, setAdminTab] = useState("users");

  // Пользователи
  const [users, setUsers] = useState([]);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    department: "Back Office",
    is_admin: false,
  });

  // Отделы
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState("");

  useEffect(() => {
    fetchProfile();
    fetchDepartments();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("token");

      if (!token) {
        onLogout();
        return;
      }
      const res = await axios.get("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(res.data);
      if (res.data.is_admin) {
        fetchUsers(token);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      toast.error("Не удалось загрузить профиль");

      if (err.response && err.response.status === 401) {
        toast.error("Сессия истекла. Войдите заново.");
        onLogout(); // Эта функция перекинет на Login
      } else {
        toast.error("Не удалось загрузить профиль");
      }

      setLoading(false);
    }
  };

  const fetchUsers = async (token) => {
    try {
      const res = await axios.get("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.data);
    } catch (err) {
      console.error("request failed", err);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await axios.get("/api/departments");
      setDepartments(res.data);
      if (res.data.length > 0) {
        setNewUser((prev) => ({ ...prev, department: res.data[0].name }));
      }
    } catch (err) {
      console.error("request failed", err);
    }
  };

  // --- ЛОГИКА ЮЗЕРОВ ---
  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      toast.error("Заполните поля");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      await axios.post("/api/admin/users", newUser, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Пользователь создан");
      setShowCreateUserModal(false);
      setNewUser({
        username: "",
        password: "",
        department: departments[0]?.name || "",
        is_admin: false,
      });
      fetchUsers(token);
    } catch (err) {
      toast.error("Ошибка создания");
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Удалить пользователя?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Удалено");
      fetchUsers(token);
    } catch (err) {
      toast.error("Ошибка");
    }
  };

  // --- ЛОГИКА ОТДЕЛОВ ---
  const handleAddDept = async () => {
    if (!newDeptName.trim()) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "/api/admin/departments",
        { name: newDeptName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Отдел добавлен");
      setNewDeptName("");
      fetchDepartments();
    } catch (err) {
      toast.error("Ошибка (возможно имя занято)");
    }
  };

  const handleDeleteDept = async (id) => {
    if (!window.confirm("Удалить отдел?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/admin/departments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Отдел удален");
      fetchDepartments();
    } catch (err) {
      toast.error("Ошибка удаления");
    }
  };

  const startEditDept = (dept) => {
    setEditingDept(dept.id);
    setEditDeptName(dept.name);
  };

  const saveDeptName = async () => {
    if (!editDeptName.trim()) return;
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `/api/admin/departments/${editingDept}`,
        { name: editDeptName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Переименовано");
      setEditingDept(null);
      fetchDepartments();
    } catch (err) {
      toast.error("Ошибка");
    }
  };

  // --- ЛОГИКА ПАРОЛЯ ---
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPass !== confirmPass) {
      toast.error("Пароли не совпадают");
      return;
    }
    setSavingPass(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "/api/profile/change-password",
        { old_password: oldPass, new_password: newPass },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Пароль изменен!");
      setOldPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err) {
      toast.error("Ошибка");
    } finally {
      setSavingPass(false);
    }
  };

  if (loading) return <div>Загрузка...</div>;
  if (!profile) return <div>Ошибка</div>;

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "50px" }}>
      {/* --- НОВЫЙ ЗАГОЛОВОК С КНОПКОЙ ВЫХОДА СПРАВА --- */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
        }}
      >
        <h1 style={{ margin: 0 }}>Личный кабинет</h1>

        <button
          onClick={onLogout}
          className="btn"
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            fontSize: "14px",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#fecaca")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#fee2e2")}
        >
          <LogOut size={18} /> Выйти
        </button>
      </div>

      <div style={{ display: "flex", gap: "30px", flexWrap: "wrap", marginBottom: "40px" }}>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <div
            className="card"
            style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "20px" }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "#eff6ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #3b82f6",
              }}
            >
              <User size={40} color="#3b82f6" />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                {profile.username}
                {profile.is_admin && (
                  <span
                    style={{
                      fontSize: "11px",
                      background: "#dc2626",
                      color: "white",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    ADMIN
                  </span>
                )}
              </h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  color: "#64748b",
                  marginTop: "5px",
                }}
              >
                <Briefcase size={16} /> <span>{profile.department}</span>
              </div>
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "10px" }}>
              <BarChart3 size={20} /> Ваша активность
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginTop: "15px",
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  padding: "15px",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: 800, color: "#334155" }}>
                  {profile.stats.created}
                </div>
                <div style={{ fontSize: "13px", color: "#64748b" }}>Задач создано</div>
              </div>
              <div
                style={{
                  background: "#ecfdf5",
                  padding: "15px",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: 800, color: "#10b981" }}>
                  {profile.stats.completed}
                </div>
                <div style={{ fontSize: "13px", color: "#059669" }}>Закрыто</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: "300px" }}>
          <div className="card" style={{ height: "100%" }}>
            <h3
              style={{
                marginTop: 0,
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#0f172a",
              }}
            >
              <Shield size={20} color="#f59e0b" /> Безопасность
            </h3>
            <form onSubmit={handleChangePassword}>
              <div className="input-group">
                <label className="input-label">Старый пароль</label>
                <div style={{ position: "relative" }}>
                  <Key
                    size={16}
                    style={{ position: "absolute", top: "12px", left: "10px", color: "#94a3b8" }}
                  />
                  <input
                    type="password"
                    className="text-input"
                    style={{ paddingLeft: "35px" }}
                    value={oldPass}
                    onChange={(e) => setOldPass(e.target.value)}
                  />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Новый пароль</label>
                <input
                  type="password"
                  className="text-input"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Повторите</label>
                <input
                  type="password"
                  className="text-input"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                />
              </div>
              <button className="btn" style={{ width: "100%" }} disabled={savingPass}>
                {savingPass ? "..." : "Обновить пароль"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* --- АДМИН ПАНЕЛЬ --- */}
      {profile.is_admin && (
        <div className="card" style={{ borderTop: "5px solid #dc2626", padding: "0" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
            <button
              onClick={() => setAdminTab("users")}
              style={{
                flex: 1,
                padding: "15px",
                background: adminTab === "users" ? "white" : "#f8fafc",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                color: adminTab === "users" ? "#dc2626" : "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <User size={18} /> Пользователи
            </button>
            <button
              onClick={() => setAdminTab("depts")}
              style={{
                flex: 1,
                padding: "15px",
                background: adminTab === "depts" ? "white" : "#f8fafc",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                color: adminTab === "depts" ? "#dc2626" : "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <Building2 size={18} /> Отделы
            </button>
          </div>

          {/* КОНТЕНТ: ПОЛЬЗОВАТЕЛИ */}
          {adminTab === "users" && (
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "15px" }}>
                <button className="btn" onClick={() => setShowCreateUserModal(true)}>
                  <UserPlus size={18} style={{ marginRight: "8px" }} /> Добавить
                </button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom: "2px solid #e2e8f0",
                      textAlign: "left",
                    }}
                  >
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
                      <td style={{ padding: "10px" }}>
                        {u.is_admin ? <b style={{ color: "#dc2626" }}>Admin</b> : "User"}
                      </td>
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        {u.id !== profile.id && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#ef4444",
                            }}
                          >
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

          {/* КОНТЕНТ: ОТДЕЛЫ */}
          {adminTab === "depts" && (
            <div style={{ padding: "20px" }}>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "20px",
                  background: "#f8fafc",
                  padding: "15px",
                  borderRadius: "8px",
                }}
              >
                <input
                  className="text-input"
                  style={{ marginBottom: 0 }}
                  placeholder="Название нового отдела"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                />
                <button className="btn" onClick={handleAddDept} disabled={!newDeptName}>
                  <Plus size={18} /> Добавить
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                  gap: "15px",
                }}
              >
                {departments.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      padding: "15px",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    {editingDept === d.id ? (
                      <div style={{ display: "flex", gap: "5px", width: "100%" }}>
                        <input
                          value={editDeptName}
                          onChange={(e) => setEditDeptName(e.target.value)}
                          style={{
                            padding: "5px",
                            borderRadius: "4px",
                            border: "1px solid #cbd5e1",
                            width: "100%",
                          }}
                        />
                        <button
                          onClick={saveDeptName}
                          style={{
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            color: "#10b981",
                          }}
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => setEditingDept(null)}
                          style={{
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            color: "#64748b",
                          }}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontWeight: 600, color: "#334155" }}>{d.name}</span>
                        <div style={{ display: "flex", gap: "5px" }}>
                          <button
                            onClick={() => startEditDept(d)}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              color: "#3b82f6",
                            }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteDept(d.id)}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              color: "#ef4444",
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* МОДАЛКА ЮЗЕРА */}
      {showCreateUserModal && (
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
            zIndex: 999,
          }}
        >
          <div className="card" style={{ width: "400px", padding: "30px" }}>
            <h3 style={{ marginTop: 0 }}>Новый пользователь</h3>
            <div className="input-group">
              <label>Логин</label>
              <input
                className="text-input"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Пароль</label>
              <input
                className="text-input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Отдел</label>
              <select
                className="text-input"
                value={newUser.department}
                onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}
            >
              <input
                type="checkbox"
                checked={newUser.is_admin}
                onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
              />
              <label>Права Администратора</label>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                className="btn"
                style={{ background: "#e2e8f0", color: "black" }}
                onClick={() => setShowCreateUserModal(false)}
              >
                Отмена
              </button>
              <button className="btn" onClick={handleCreateUser}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
