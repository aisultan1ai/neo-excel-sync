import React, { useState, useEffect, useCallback, useRef } from "react";
import { Search, UserPlus, RotateCcw, Lock, ShieldAlert } from "lucide-react";
import { toast } from "react-toastify";
import {
  fetchClients, fetchClientDetails, createClient, updateClient,
  updateClientStatus, deleteClient, uploadFile, deleteFile, downloadFile,
  resetAllStatuses, checkPermission,
} from "./api";
import { STATUS_STYLES, STATUS_DB_MAP, STATUS_DISPLAY_MAP } from "./constants";
import ClientRow from "./ClientRow";
import ClientModal from "./ClientModal";
import ClientDrawer from "./ClientDrawer";
import ResetConfirmModal from "./ResetConfirmModal";

const ReportsPage = () => {
  const [userDept, setUserDept] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", account: "", folder_path: "" });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState({ name: "", email: "", account: "", folder_path: "" });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    checkPermission()
      .then(({ department, isAdmin: admin }) => {
        setUserDept(department);
        setIsAdmin(admin);
        if (department === "Back Office" || admin) loadClients("");
      })
      .catch(console.error)
      .finally(() => setLoadingAuth(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadClients = useCallback(async (term = "") => {
    try { setClients(await fetchClients(term)); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    let result = clients;
    if (statusFilter !== "All") result = result.filter((c) => c.status === statusFilter);
    setFilteredClients(result);
  }, [clients, statusFilter]);

  useEffect(() => {
    if ((userDept === "Back Office" || isAdmin) && !loadingAuth) {
      const timer = setTimeout(() => loadClients(search), 300);
      return () => clearTimeout(timer);
    }
  }, [search, loadClients, userDept, isAdmin, loadingAuth]);

  const loadDetails = useCallback(async (id) => {
    try { setClientDetails(await fetchClientDetails(id)); } catch (e) { console.error(e); }
  }, []);

  const openDrawer = useCallback((client) => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setSelectedClient(client);
    setClientDetails(null);
    setIsDrawerOpen(true);
    document.body.style.overflow = "hidden";
    loadDetails(client.id);
  }, [loadDetails]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    document.body.style.overflow = "auto";
    closeTimerRef.current = setTimeout(() => setSelectedClient(null), 300);
  }, []);

  const handleAddClient = async () => {
    if (!newClient.name.trim()) return toast.warning("Нужно имя");
    try {
      await createClient(newClient);
      setShowAddModal(false);
      setNewClient({ name: "", email: "", account: "", folder_path: "" });
      loadClients(search);
      toast.success("Создано");
    } catch { toast.error("Ошибка"); }
  };

  const handleUpdateClient = async () => {
    if (!editingClient.name.trim()) return;
    try {
      await updateClient(selectedClient.id, editingClient);
      setShowEditModal(false);
      loadDetails(selectedClient.id);
      loadClients(search);
      toast.success("Данные обновлены");
    } catch { toast.error("Ошибка обновления"); }
  };

  const handleStatusChange = async (newStatusDisplay) => {
    const dbStatus = STATUS_DISPLAY_MAP[newStatusDisplay];
    try {
      await updateClientStatus(selectedClient.id, dbStatus);
      setClientDetails((prev) => ({ ...prev, status: dbStatus }));
      setClients((prev) => prev.map((c) => (c.id === selectedClient.id ? { ...c, status: dbStatus } : c)));
      toast.info("Статус обновлен");
    } catch { toast.error("Ошибка"); }
  };

  const handleDeleteClient = async () => {
    if (!confirm("Удалить клиента?")) return;
    try { await deleteClient(selectedClient.id); closeDrawer(); loadClients(search); toast.success("Удалено"); }
    catch { toast.error("Ошибка"); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { await uploadFile(selectedClient.id, file); loadDetails(selectedClient.id); toast.success("Загружено"); }
    catch { toast.error("Ошибка"); }
  };

  const handleDeleteFile = async (filename) => {
    if (!confirm("Удалить файл?")) return;
    try { await deleteFile(selectedClient.id, filename); loadDetails(selectedClient.id); toast.success("Файл удален"); }
    catch { toast.error("Ошибка"); }
  };

  const handleDownloadFile = async (filename) => {
    try {
      const blob = await downloadFile(selectedClient.id, filename);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
    } catch { toast.error("Ошибка"); }
  };

  const handleResetStatuses = async () => {
    try { await resetAllStatuses(); loadClients(search); toast.success("Все статусы сброшены"); }
    catch { toast.error("Ошибка при сбросе статусов"); }
    finally { setShowResetConfirm(false); }
  };

  if (loadingAuth) return <div style={{ padding: 40, textAlign: "center" }}>Загрузка...</div>;
  if (userDept !== "Back Office" && !isAdmin) {
    return (
      <div style={{ height: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        <div style={{ background: "#fee2e2", padding: "20px", borderRadius: "50%", marginBottom: "20px" }}>
          <Lock size={48} color="#ef4444" />
        </div>
        <h2 style={{ color: "#1e293b", marginBottom: "10px" }}>Доступ ограничен</h2>
        <p style={{ textAlign: "center", maxWidth: "400px" }}>
          Раздел <b>"Отчеты"</b> доступен только для сотрудников департамента
          <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", marginLeft: "5px", fontWeight: 600 }}>Back Office</span>.
        </p>
        <div style={{ marginTop: "20px", fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
          <ShieldAlert size={16} /> Ваш отдел: <b>{userDept}</b>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "calc(100vh - 40px)", display: "flex", flexDirection: "column", paddingRight: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", margin: 0 }}>Клиентские отчеты</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn" onClick={() => setShowResetConfirm(true)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>
            <RotateCcw size={18} /> Сбросить статусы
          </button>
          <button className="btn" onClick={() => setShowAddModal(true)} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <UserPlus size={18} /> Добавить клиента
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "15px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
        <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: "250px", display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", padding: "0 15px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <Search size={18} color="#94a3b8" />
          <input className="text-input" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ border: "none", background: "transparent", boxShadow: "none", height: "40px", marginBottom: 0 }} />
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {["All", "gray", "yellow", "green"].map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)} style={{ padding: "8px 16px", borderRadius: "20px", border: "1px solid", borderColor: statusFilter === status ? "#3b82f6" : "#e2e8f0", background: statusFilter === status ? "#eff6ff" : "white", color: statusFilter === status ? "#2563eb" : "#64748b", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
              {status === "All" ? "Все" : STATUS_DB_MAP[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ overflowY: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", position: "sticky", top: 0 }}>
              <tr>
                <th style={{ padding: "15px", textAlign: "left", width: "40%" }}>Клиент</th>
                <th style={{ padding: "15px", textAlign: "left" }}>Статус</th>
                <th style={{ padding: "15px", textAlign: "right" }}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <ClientRow key={client.id} client={client} statusInfo={STATUS_STYLES[STATUS_DB_MAP[client.status]] || STATUS_STYLES["Нет"]} onClick={openDrawer} />
              ))}
              {filteredClients.length === 0 && (
                <tr><td colSpan="3" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>Клиенты не найдены</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientDrawer
        isOpen={isDrawerOpen}
        client={selectedClient}
        details={clientDetails}
        onClose={closeDrawer}
        onEdit={() => {
          if (!clientDetails) return;
          setEditingClient({ name: clientDetails.name, email: clientDetails.email || "", account: clientDetails.account_number || "", folder_path: clientDetails.folder_path || "" });
          setShowEditModal(true);
        }}
        onStatusChange={handleStatusChange}
        onFileUpload={handleFileUpload}
        onFileDownload={handleDownloadFile}
        onFileDelete={handleDeleteFile}
        onDeleteClient={handleDeleteClient}
      />

      {showAddModal && <ClientModal title="Новый клиент" data={newClient} setData={setNewClient} onSave={handleAddClient} onClose={() => setShowAddModal(false)} />}
      {showEditModal && <ClientModal title="Редактировать" data={editingClient} setData={setEditingClient} onSave={handleUpdateClient} onClose={() => setShowEditModal(false)} />}
      {showResetConfirm && <ResetConfirmModal onConfirm={handleResetStatuses} onCancel={() => setShowResetConfirm(false)} />}

      <style>{`.table-row-hover:hover { background-color: #f8fafc; } .btn-icon { background: none; border: none; cursor: pointer; } .btn-icon:hover { color: #3b82f6; }`}</style>
    </div>
  );
};

export default ReportsPage;
