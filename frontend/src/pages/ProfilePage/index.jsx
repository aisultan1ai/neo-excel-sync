import React, { useState, useEffect } from "react";
import axios from "axios";
import { User, Shield, Key, BarChart3, Briefcase, LogOut } from "lucide-react";
import { toast } from "react-toastify";
import AdminPanel from "./AdminPanel";

const ProfilePage = ({ onLogout }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => { fetchProfile(); fetchDepartments(); }, []);

  const fetchProfile = async () => {
    try {
      const res = await axios.get("/api/v1/profile");
      setProfile(res.data);
      if (res.data.is_admin) fetchUsers();
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401) { toast.error("Сессия истекла. Войдите заново."); onLogout(); }
      else toast.error("Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try { const res = await axios.get("/api/v1/admin/users"); setUsers(res.data); }
    catch (err) { console.error(err); }
  };

  const fetchDepartments = async () => {
    try {
      const res = await axios.get("/api/v1/departments");
      setDepartments(res.data);
    } catch (err) { console.error(err); }
  };

  const handleCreateUser = async (newUser) => {
    if (!newUser.username || !newUser.password) { toast.error("Заполните поля"); return; }
    try { await axios.post("/api/v1/admin/users", newUser); toast.success("Пользователь создан"); fetchUsers(); }
    catch { toast.error("Ошибка создания"); }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Удалить пользователя?")) return;
    try { await axios.delete(`/api/v1/admin/users/${id}`); toast.success("Удалено"); fetchUsers(); }
    catch { toast.error("Ошибка"); }
  };

  const handleAddDept = async (name) => {
    if (!name.trim()) return;
    try { await axios.post("/api/v1/admin/departments", { name }); toast.success("Отдел добавлен"); fetchDepartments(); }
    catch { toast.error("Ошибка (возможно имя занято)"); }
  };

  const handleDeleteDept = async (id) => {
    if (!window.confirm("Удалить отдел?")) return;
    try { await axios.delete(`/api/v1/admin/departments/${id}`); toast.success("Отдел удален"); fetchDepartments(); }
    catch { toast.error("Ошибка удаления"); }
  };

  const handleRenameDept = async (id, name) => {
    if (!name.trim()) return;
    try { await axios.put(`/api/v1/admin/departments/${id}`, { name }); toast.success("Переименовано"); fetchDepartments(); }
    catch { toast.error("Ошибка"); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPass !== confirmPass) { toast.error("Пароли не совпадают"); return; }
    setSavingPass(true);
    try {
      await axios.post("/api/v1/profile/change-password", { old_password: oldPass, new_password: newPass });
      toast.success("Пароль изменен!");
      setOldPass(""); setNewPass(""); setConfirmPass("");
    } catch { toast.error("Ошибка"); }
    finally { setSavingPass(false); }
  };

  if (loading) return <div>Загрузка...</div>;
  if (!profile) return <div>Ошибка</div>;

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "50px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <h1 style={{ margin: 0 }}>Личный кабинет</h1>
        <button onClick={onLogout} className="btn" style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", fontSize: "14px" }} onMouseOver={(e) => (e.currentTarget.style.background = "#fecaca")} onMouseOut={(e) => (e.currentTarget.style.background = "#fee2e2")}>
          <LogOut size={18} /> Выйти
        </button>
      </div>

      <div style={{ display: "flex", gap: "30px", flexWrap: "wrap", marginBottom: "40px" }}>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <div className="card" style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #3b82f6" }}>
              <User size={40} color="#3b82f6" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
                {profile.username}
                {profile.is_admin && <span style={{ fontSize: "11px", background: "#dc2626", color: "white", padding: "2px 6px", borderRadius: "4px" }}>ADMIN</span>}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#64748b", marginTop: "5px" }}>
                <Briefcase size={16} /> <span>{profile.department}</span>
              </div>
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "10px" }}><BarChart3 size={20} /> Ваша активность</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginTop: "15px" }}>
              <div style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: 800, color: "#334155" }}>{profile.stats.created}</div>
                <div style={{ fontSize: "13px", color: "#64748b" }}>Задач создано</div>
              </div>
              <div style={{ background: "#ecfdf5", padding: "15px", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: 800, color: "#10b981" }}>{profile.stats.completed}</div>
                <div style={{ fontSize: "13px", color: "#059669" }}>Закрыто</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: "300px" }}>
          <div className="card" style={{ height: "100%" }}>
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "10px", color: "#0f172a" }}>
              <Shield size={20} color="#f59e0b" /> Безопасность
            </h3>
            <form onSubmit={handleChangePassword}>
              <div className="input-group">
                <label className="input-label">Старый пароль</label>
                <div style={{ position: "relative" }}>
                  <Key size={16} style={{ position: "absolute", top: "12px", left: "10px", color: "#94a3b8" }} />
                  <input type="password" className="text-input" style={{ paddingLeft: "35px" }} value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Новый пароль</label>
                <input type="password" className="text-input" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Повторите</label>
                <input type="password" className="text-input" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
              </div>
              <button className="btn" style={{ width: "100%" }} disabled={savingPass}>{savingPass ? "..." : "Обновить пароль"}</button>
            </form>
          </div>
        </div>
      </div>

      {profile.is_admin && (
        <AdminPanel
          profile={profile}
          users={users}
          departments={departments}
          onCreateUser={handleCreateUser}
          onDeleteUser={handleDeleteUser}
          onAddDept={handleAddDept}
          onDeleteDept={handleDeleteDept}
          onRenameDept={handleRenameDept}
        />
      )}
    </div>
  );
};

export default ProfilePage;
