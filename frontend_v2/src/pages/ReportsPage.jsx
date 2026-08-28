import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  UserPlus,
  Trash2,
  Mail,
  FileText,
  Download,
  X,
  Edit,
  Lock,
  ShieldAlert,
  ChevronRight,
  Upload,
  Briefcase,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "react-toastify";

import { api } from "../api/client";

const STATUS_STYLES = {
  Нет: { bg: "#f1f5f9", color: "#64748b", label: "Нет отчетов" },
  "В ожидании": { bg: "#fef9c3", color: "#b45309", label: "В ожидании" },
  Отправлено: { bg: "#dcfce7", color: "#166534", label: "Отправлено" },
};

const STATUS_DB_MAP = { gray: "Нет", yellow: "В ожидании", green: "Отправлено" };
const STATUS_DISPLAY_MAP = { Нет: "gray", "В ожидании": "yellow", Отправлено: "green" };

const ClientRow = React.memo(function ClientRow({ client, statusInfo, onClick }) {
  return (
    <tr className="reports-table-row" onClick={() => onClick(client)}>
      <td>
        <div className="reports-client-name">{client.name}</div>
        <div className="reports-client-id">ID: {client.id}</div>
      </td>
      <td>
        <span
          className="reports-status-pill"
          style={{ background: statusInfo.bg, color: statusInfo.color }}
        >
          {statusInfo.label}
        </span>
      </td>
      <td className="reports-cell-right">
        <button className="icon-btn" type="button">
          <ChevronRight size={20} />
        </button>
      </td>
    </tr>
  );
});

function ClientModal({ title, data, setData, onSave, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="card modal-card">
        <button className="reports-modal-close" onClick={onClose} type="button">
          <X size={20} />
        </button>

        <h2>{title}</h2>

        <div className="form-group">
          <label>Имя</label>
          <input
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            value={data.email}
            onChange={(e) => setData({ ...data, email: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Счет</label>
          <input
            value={data.account_number}
            onChange={(e) => setData({ ...data, account_number: e.target.value })}
          />
        </div>

        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="save-btn" onClick={onSave} type="button">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
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
  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    account_number: "",
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState({
    name: "",
    email: "",
    account_number: "",
  });

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const hasAccess = useMemo(
    () => userDept === "Back Office" || isAdmin,
    [userDept, isAdmin]
  );

  useEffect(() => {
    async function checkPermission() {
      try {
        const res = await api.get("/api/v2/profile");
        setUserDept(res.data.department);
        setIsAdmin(!!res.data.is_admin);

        if (res.data.department === "Back Office" || res.data.is_admin) {
          fetchClients("");
        }
      } catch (e) {
        console.error(e);
        toast.error("Не удалось загрузить профиль");
      } finally {
        setLoadingAuth(false);
      }
    }

    checkPermission();
  }, []);

  const fetchClients = useCallback(async (searchTerm = "") => {
    try {
      const res = await api.get(`/api/v2/clients?search=${encodeURIComponent(searchTerm)}`);
      setClients(res.data || []);
    } catch (e) {
      console.error(e);
      toast.error("Не удалось загрузить клиентов");
    }
  }, []);

  useEffect(() => {
    let result = clients;
    if (statusFilter !== "All") {
      result = result.filter((c) => c.status === statusFilter);
    }
    setFilteredClients(result);
  }, [clients, statusFilter]);

  useEffect(() => {
    if (!hasAccess || loadingAuth) return;

    const timer = setTimeout(() => {
      fetchClients(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, fetchClients, hasAccess, loadingAuth]);

  const fetchDetails = useCallback(async (id) => {
    try {
      const res = await api.get(`/api/v2/clients/${id}`);
      setClientDetails(res.data);
    } catch (e) {
      console.error(e);
      toast.error("Не удалось загрузить карточку клиента");
    }
  }, []);

  const openDrawer = useCallback(
    (client) => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      setSelectedClient(client);
      setClientDetails(null);
      setIsDrawerOpen(true);
      document.body.style.overflow = "hidden";

      fetchDetails(client.id);
    },
    [fetchDetails]
  );

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    document.body.style.overflow = "auto";

    closeTimerRef.current = setTimeout(() => {
      setSelectedClient(null);
    }, 300);
  }, []);

  async function handleAddClient() {
    if (!newClient.name.trim()) {
      toast.warning("Нужно имя");
      return;
    }

    try {
      await api.post("/api/v2/clients", {
        name: newClient.name.trim(),
        email: newClient.email.trim(),
        account_number: newClient.account_number.trim(),
      });

      setShowAddModal(false);
      setNewClient({ name: "", email: "", account_number: "" });
      fetchClients(search);
      toast.success("Клиент создан");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Ошибка создания клиента");
    }
  }

  function openEditModal() {
    if (!clientDetails) return;

    setEditingClient({
      name: clientDetails.name || "",
      email: clientDetails.email || "",
      account_number: clientDetails.account_number || "",
    });

    setShowEditModal(true);
  }

  async function handleUpdateClient() {
    if (!editingClient.name.trim()) return;

    try {
      await api.put(`/api/v2/clients/${selectedClient.id}`, {
        name: editingClient.name.trim(),
        email: editingClient.email.trim(),
        account_number: editingClient.account_number.trim(),
        status: clientDetails?.status || "gray",
      });

      setShowEditModal(false);
      fetchDetails(selectedClient.id);
      fetchClients(search);
      toast.success("Данные обновлены");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Ошибка обновления");
    }
  }

  async function handleStatusChange(newStatusDisplay) {
    const dbStatus = STATUS_DISPLAY_MAP[newStatusDisplay];

    try {
      await api.put(`/api/v2/clients/${selectedClient.id}`, {
        name: clientDetails?.name || "",
        email: clientDetails?.email || "",
        account_number: clientDetails?.account_number || "",
        status: dbStatus,
      });

      setClientDetails((prev) => ({ ...prev, status: dbStatus }));
      setClients((prev) =>
        prev.map((c) => (c.id === selectedClient.id ? { ...c, status: dbStatus } : c))
      );

      toast.info("Статус обновлен");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка обновления статуса");
    }
  }

  function openResetModal() {
    setShowResetConfirm(true);
  }

  async function executeResetStatuses() {
    try {
      await api.post("/api/v2/clients/reset-status", {});
      fetchClients(search);
      toast.success("Все статусы сброшены");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка при сбросе статусов");
    } finally {
      setShowResetConfirm(false);
    }
  }

  async function handleDeleteClient() {
    if (!window.confirm("Удалить клиента?")) return;

    try {
      await api.delete(`/api/v2/clients/${selectedClient.id}`);
      closeDrawer();
      fetchClients(search);
      toast.success("Клиент удален");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка удаления");
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post(`/api/v2/clients/${selectedClient.id}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      fetchDetails(selectedClient.id);
      toast.success("Файл загружен");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка загрузки файла");
    } finally {
      e.target.value = "";
    }
  }

  async function handleDeleteFile(filename) {
    if (!window.confirm("Удалить файл?")) return;

    try {
      await api.delete(`/api/v2/clients/${selectedClient.id}/files/${encodeURIComponent(filename)}`);
      fetchDetails(selectedClient.id);
      toast.success("Файл удален");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка удаления файла");
    }
  }

  async function handleDownloadFile(filename) {
    try {
      const res = await api.get(
        `/api/v2/clients/${selectedClient.id}/files/${encodeURIComponent(filename)}`,
        { responseType: "blob" }
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка скачивания файла");
    }
  }

  if (loadingAuth) {
    return <div className="page"><div className="card">Загрузка...</div></div>;
  }

  if (!hasAccess) {
    return (
      <div className="reports-no-access">
        <div className="reports-no-access-icon">
          <Lock size={48} color="#ef4444" />
        </div>

        <h2>Доступ ограничен</h2>
        <p>
          Раздел <b>«Отчеты»</b> доступен только для сотрудников департамента
          <span className="reports-dept-pill">Back Office</span>.
        </p>

        <div className="reports-no-access-meta">
          <ShieldAlert size={16} /> Ваш отдел: <b>{userDept}</b>
        </div>
      </div>
    );
  }

  return (
    <div className="page reports-page">
      <div className="reports-header">
        <h1>Клиентские отчеты</h1>

        <div className="reports-header-actions">
          <button className="secondary-btn" onClick={openResetModal} type="button">
            <RotateCcw size={18} />
            <span>Сбросить статусы</span>
          </button>

          <button className="save-btn" onClick={() => setShowAddModal(true)} type="button">
            <UserPlus size={18} />
            <span>Добавить клиента</span>
          </button>
        </div>
      </div>

      <div className="card reports-toolbar">
        <div className="reports-search">
          <Search size={18} color="#94a3b8" />
          <input
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="reports-filters">
          {["All", "gray", "yellow", "green"].map((status) => (
            <button
              key={status}
              className={`reports-filter-btn ${statusFilter === status ? "active" : ""}`}
              onClick={() => setStatusFilter(status)}
              type="button"
            >
              {status === "All" ? "Все" : STATUS_DB_MAP[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="card reports-table-card">
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Клиент</th>
                <th>Статус</th>
                <th className="reports-cell-right">Действие</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  statusInfo={STATUS_STYLES[STATUS_DB_MAP[client.status]] || STATUS_STYLES["Нет"]}
                  onClick={openDrawer}
                />
              ))}

              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan="3" className="reports-empty-cell">
                    Клиенты не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isDrawerOpen && <div className="reports-backdrop" onClick={closeDrawer} />}

      <div className={`reports-drawer ${isDrawerOpen ? "open" : ""}`}>
        {selectedClient && (
          <>
            <div className="reports-drawer-head">
              <h2>Карточка клиента</h2>
              <button className="icon-btn" onClick={closeDrawer} type="button">
                <X size={24} />
              </button>
            </div>

            <div className="reports-drawer-body">
              {!clientDetails ? (
                <div className="reports-loading-state">Загрузка данных...</div>
              ) : (
                <>
                  <div className="reports-client-block">
                    <div className="reports-client-head">
                      <h3>{clientDetails.name}</h3>

                      <button className="icon-btn" onClick={openEditModal} type="button">
                        <Edit size={20} />
                      </button>
                    </div>

                    <div className="reports-client-info-box">
                      <div className="reports-info-row">
                        <Mail size={16} color="#94a3b8" />
                        <span>{clientDetails.email || "Email не указан"}</span>
                      </div>

                      <div className="reports-info-row">
                        <Briefcase size={16} color="#94a3b8" />
                        <span>{clientDetails.account_number || "Счет не указан"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="reports-status-block">
                    <label className="reports-label">Статус отчетов</label>

                    <div className="reports-status-buttons">
                      {["Нет", "В ожидании", "Отправлено"].map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={`reports-status-btn ${
                            STATUS_DB_MAP[clientDetails.status] === st ? "active" : ""
                          }`}
                          style={{
                            borderColor:
                              STATUS_DB_MAP[clientDetails.status] === st
                                ? STATUS_STYLES[st].color
                                : "#e2e8f0",
                            background:
                              STATUS_DB_MAP[clientDetails.status] === st
                                ? STATUS_STYLES[st].bg
                                : "white",
                            color:
                              STATUS_DB_MAP[clientDetails.status] === st
                                ? STATUS_STYLES[st].color
                                : "#64748b",
                          }}
                          onClick={() => handleStatusChange(st)}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reports-files-block">
                    <div className="reports-files-head">
                      <h4>Файлы ({clientDetails.files ? clientDetails.files.length : 0})</h4>

                      <label className="save-btn reports-upload-btn">
                        <Upload size={14} />
                        <span>Загрузить</span>
                        <input type="file" hidden onChange={handleFileUpload} />
                      </label>
                    </div>

                    {clientDetails.files && clientDetails.files.length > 0 ? (
                      <div className="reports-files-list">
                        {clientDetails.files.map((file, idx) => (
                          <div key={idx} className="reports-file-item">
                            <div className="reports-file-icon">
                              <FileText size={20} color="#3b82f6" />
                            </div>

                            <div className="reports-file-meta">
                              <div className="reports-file-title">{file.name}</div>
                              <div className="reports-file-date">
                                {new Date(file.modified * 1000).toLocaleDateString()}
                              </div>
                            </div>

                            <button
                              className="icon-btn"
                              type="button"
                              onClick={() => handleDownloadFile(file.name)}
                            >
                              <Download size={16} />
                            </button>

                            <button
                              className="icon-btn danger"
                              type="button"
                              onClick={() => handleDeleteFile(file.name)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="reports-no-files">Нет загруженных файлов</div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="reports-drawer-footer">
              <button
                className="save-btn"
                type="button"
                onClick={() => {
                  if (clientDetails?.email) {
                    window.location.href = `mailto:${clientDetails.email}`;
                  }
                }}
                disabled={!clientDetails?.email}
              >
                <Mail size={18} />
                <span>Написать</span>
              </button>

              <button className="secondary-btn danger" onClick={handleDeleteClient} type="button">
                <Trash2 size={18} />
              </button>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <ClientModal
          title="Новый клиент"
          data={newClient}
          setData={setNewClient}
          onSave={handleAddClient}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showEditModal && (
        <ClientModal
          title="Редактировать"
          data={editingClient}
          setData={setEditingClient}
          onSave={handleUpdateClient}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showResetConfirm && (
        <div className="modal-backdrop">
          <div className="card reports-reset-modal">
            <div className="reports-reset-icon">
              <AlertTriangle size={32} color="#ef4444" />
            </div>

            <h3>Сбросить статусы?</h3>

            <p>
              Вы собираетесь сбросить статус <b>всех</b> клиентов на «Нет отчетов».
              Это действие нельзя отменить.
            </p>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowResetConfirm(false)} type="button">
                Отмена
              </button>
              <button className="save-btn" onClick={executeResetStatuses} type="button">
                Да, сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}