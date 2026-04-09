import React, { useEffect, useMemo, useState } from "react";
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
import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { clearToken } from "../auth/token";

export default function ProfilePage() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const [adminTab, setAdminTab] = useState("users");

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    department: "Back Office",
    is_admin: false,
  });

  const [newDeptName, setNewDeptName] = useState("");
  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState("");

  const isAdmin = useMemo(() => Boolean(profile?.is_admin), [profile]);

  useEffect(() => {
    async function load() {
      try {
        const [profileRes, departmentsRes] = await Promise.all([
          api.get("/api/v2/profile"),
          api.get("/api/v2/departments"),
        ]);

        setProfile(profileRes.data);
        setDepartments(departmentsRes.data || []);

        if ((departmentsRes.data || []).length > 0) {
          setNewUser((prev) => ({
            ...prev,
            department: departmentsRes.data[0].name,
          }));
        }

        if (profileRes.data?.is_admin) {
          const usersRes = await api.get("/api/v2/admin/users");
          setUsers(usersRes.data || []);
        }
      } catch (error) {
        toast.error(error?.response?.data?.detail || "Не удалось загрузить профиль");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleLogout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  async function reloadUsers() {
    const res = await api.get("/api/v2/admin/users");
    setUsers(res.data || []);
  }

  async function reloadDepartments() {
    const res = await api.get("/api/v2/departments");
    setDepartments(res.data || []);
  }

  async function handleChangePassword(event) {
    event.preventDefault();

    if (!oldPass || !newPass || !confirmPass) {
      toast.error("Заполни все поля");
      return;
    }

    if (newPass !== confirmPass) {
      toast.error("Пароли не совпадают");
      return;
    }

    setSavingPass(true);
    try {
      await api.post("/api/v2/profile/change-password", {
        old_password: oldPass,
        new_password: newPass,
      });

      toast.success("Пароль изменен");
      setOldPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка смены пароля");
    } finally {
      setSavingPass(false);
    }
  }

  async function handleCreateUser() {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      toast.error("Заполни логин и пароль");
      return;
    }

    try {
      await api.post("/api/v2/admin/users", {
        username: newUser.username.trim(),
        password: newUser.password,
        department: newUser.department,
        is_admin: newUser.is_admin,
      });

      toast.success("Пользователь создан");
      setShowCreateUserModal(false);
      setNewUser({
        username: "",
        password: "",
        department: departments[0]?.name || "",
        is_admin: false,
      });

      await reloadUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка создания пользователя");
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm("Удалить пользователя?")) return;

    try {
      await api.delete(`/api/v2/admin/users/${id}`);
      toast.success("Пользователь удален");
      await reloadUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка удаления");
    }
  }

  async function handleAddDept() {
    if (!newDeptName.trim()) return;

    try {
      await api.post("/api/v2/admin/departments", { name: newDeptName.trim() });
      toast.success("Отдел добавлен");
      setNewDeptName("");
      await reloadDepartments();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка добавления отдела");
    }
  }

  async function handleDeleteDept(id) {
    if (!window.confirm("Удалить отдел?")) return;

    try {
      await api.delete(`/api/v2/admin/departments/${id}`);
      toast.success("Отдел удален");
      await reloadDepartments();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка удаления отдела");
    }
  }

  function startEditDept(dept) {
    setEditingDept(dept.id);
    setEditDeptName(dept.name);
  }

  async function saveDeptName() {
    if (!editDeptName.trim()) return;

    try {
      await api.put(`/api/v2/admin/departments/${editingDept}`, {
        name: editDeptName.trim(),
      });
      toast.success("Отдел переименован");
      setEditingDept(null);
      setEditDeptName("");
      await reloadDepartments();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка переименования");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Профиль</h1>
        <div className="card">Загрузка...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <h1>Профиль</h1>
        <div className="card">Не удалось загрузить профиль.</div>
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <div className="profile-header">
        <h1>Личный кабинет</h1>

        <button className="profile-logout-btn" onClick={handleLogout}>
          <LogOut size={18} />
          <span>Выйти</span>
        </button>
      </div>

      <div className="profile-grid">
        <div className="profile-col">
          <div className="card profile-card-user">
            <div className="profile-avatar">
              <User size={40} />
            </div>

            <div>
              <h2 className="profile-username">
                {profile.username}
                {profile.is_admin && <span className="profile-admin-badge">ADMIN</span>}
              </h2>

              <div className="profile-meta">
                <Briefcase size={16} />
                <span>{profile.department}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">
              <BarChart3 size={20} />
              <span>Ваша активность</span>
            </h3>

            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-value">{profile?.stats?.created ?? 0}</div>
                <div className="stat-label">Задач создано</div>
              </div>

              <div className="stat-box success">
                <div className="stat-value">{profile?.stats?.completed ?? 0}</div>
                <div className="stat-label">Закрыто</div>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-col">
          <div className="card">
            <h3 className="section-title">
              <Shield size={20} />
              <span>Безопасность</span>
            </h3>

            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>Старый пароль</label>
                <div className="input-icon-wrap">
                  <Key size={16} className="input-icon" />
                  <input
                    type="password"
                    value={oldPass}
                    onChange={(e) => setOldPass(e.target.value)}
                    className="with-icon"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Новый пароль</label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Повторите пароль</label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                />
              </div>

              <button type="submit" className="save-btn" disabled={savingPass}>
                {savingPass ? "Сохранение..." : "Обновить пароль"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="card admin-panel-card">
          <div className="admin-tabs">
            <button
              className={`admin-tab ${adminTab === "users" ? "active" : ""}`}
              onClick={() => setAdminTab("users")}
            >
              <User size={18} />
              <span>Пользователи</span>
            </button>

            <button
              className={`admin-tab ${adminTab === "depts" ? "active" : ""}`}
              onClick={() => setAdminTab("depts")}
            >
              <Building2 size={18} />
              <span>Отделы</span>
            </button>
          </div>

          {adminTab === "users" && (
            <div className="admin-content">
              <div className="admin-toolbar">
                <button className="save-btn" onClick={() => setShowCreateUserModal(true)}>
                  <UserPlus size={18} />
                  <span>Добавить</span>
                </button>
              </div>

              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Логин</th>
                      <th>Отдел</th>
                      <th>Роль</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td>{user.department}</td>
                        <td>{user.is_admin ? "Admin" : "User"}</td>
                        <td className="actions-cell">
                          {user.id !== profile.id && (
                            <button
                              className="icon-btn danger"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}

                    {users.length === 0 && (
                      <tr>
                        <td colSpan="4">Пользователей пока нет</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {adminTab === "depts" && (
            <div className="admin-content">
              <div className="dept-create-row">
                <input
                  placeholder="Название нового отдела"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                />
                <button className="save-btn" onClick={handleAddDept}>
                  <Plus size={18} />
                  <span>Добавить</span>
                </button>
              </div>

              <div className="dept-grid">
                {departments.map((dept) => (
                  <div key={dept.id} className="dept-card">
                    {editingDept === dept.id ? (
                      <div className="dept-edit-row">
                        <input
                          value={editDeptName}
                          onChange={(e) => setEditDeptName(e.target.value)}
                        />
                        <button className="icon-btn success" onClick={saveDeptName}>
                          <Check size={16} />
                        </button>
                        <button className="icon-btn" onClick={() => setEditingDept(null)}>
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="dept-name">{dept.name}</span>
                        <div className="dept-actions">
                          <button className="icon-btn" onClick={() => startEditDept(dept)}>
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={() => handleDeleteDept(dept.id)}
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

      {showCreateUserModal && (
        <div className="modal-backdrop">
          <div className="card modal-card">
            <h3>Новый пользователь</h3>

            <div className="form-group">
              <label>Логин</label>
              <input
                value={newUser.username}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, username: e.target.value }))
                }
              />
            </div>

            <div className="form-group">
              <label>Пароль</label>
              <input
                value={newUser.password}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, password: e.target.value }))
                }
              />
            </div>

            <div className="form-group">
              <label>Отдел</label>
              <select
                value={newUser.department}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, department: e.target.value }))
                }
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={newUser.is_admin}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, is_admin: e.target.checked }))
                }
              />
              <span>Права администратора</span>
            </label>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowCreateUserModal(false)}>
                Отмена
              </button>
              <button className="save-btn" onClick={handleCreateUser}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}