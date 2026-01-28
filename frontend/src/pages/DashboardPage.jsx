import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import {
  Activity,
  Users,
  CheckCircle,
  Clock,
  FileDiff,
  Plus,
  Server,
  Database,
  Edit2,
  Trash2,
  X,
  Save,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("User");
  const [isAdmin, setIsAdmin] = useState(false);

  const [health, setHealth] = useState({ api: "Checking...", db: "Checking..." });

  // Problems
  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [problemsUpdatedAt, setProblemsUpdatedAt] = useState(null);

  // Modal
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [problemModalMode, setProblemModalMode] = useState("view"); // view | create | edit
  const [selectedProblem, setSelectedProblem] = useState(null);

  // Form
  const [problemTitle, setProblemTitle] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [savingProblem, setSavingProblem] = useState(false);

  useEffect(() => {
    fetchDashboard();
    checkSystemHealth();

    const interval = setInterval(checkSystemHealth, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const checkSystemHealth = async () => {
    try {
      const res = await axios.get("/api/health", { timeout: 2000 });
      setHealth(res.data);
    } catch (err) {
      setHealth({ api: "Offline", db: "Disconnected" });
    }
  };

  const fetchProblems = async () => {
    try {
      setProblemsLoading(true);
      const res = await axios.get("/api/problems", { headers: authHeaders() });
      setProblems(Array.isArray(res.data) ? res.data : []);
      setProblemsUpdatedAt(new Date());
    } catch (err) {
      console.error("problems request failed", err);
      setProblems([]);
    } finally {
      setProblemsLoading(false);
    }
  };

  const fetchDashboard = async () => {
    try {
      const resProfile = await axios.get("/api/profile", { headers: authHeaders() });
      setUsername(resProfile.data?.username || "User");

      const adminFlag =
        resProfile.data?.is_admin === true ||
        String(resProfile.data?.role || "").toLowerCase() === "admin";
      setIsAdmin(Boolean(adminFlag));

      const res = await axios.get("/api/dashboard", { headers: authHeaders() });
      setStats(res.data);

      await fetchProblems();
      setLoading(false);
    } catch (err) {
      console.error("request failed", err);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === "Online" || status === "Connected") return "#4ade80";
    if (status === "Checking...") return "#94a3b8";
    return "#ef4444";
  };

  // Modal helpers
  const openViewProblem = (p) => {
    setSelectedProblem(p);
    setProblemModalMode("view");
    setProblemTitle(p?.title || "");
    setProblemDescription(p?.description || "");
    setProblemModalOpen(true);
  };

  const openCreateProblem = () => {
    setSelectedProblem(null);
    setProblemModalMode("create");
    setProblemTitle("");
    setProblemDescription("");
    setProblemModalOpen(true);
  };

  const openEditProblem = (p) => {
    setSelectedProblem(p);
    setProblemModalMode("edit");
    setProblemTitle(p?.title || "");
    setProblemDescription(p?.description || "");
    setProblemModalOpen(true);
  };

  const closeProblemModal = () => {
    setProblemModalOpen(false);
    setSelectedProblem(null);
    setProblemTitle("");
    setProblemDescription("");
    setSavingProblem(false);
  };

  const saveProblem = async () => {
    if (!isAdmin) return;
    const title = problemTitle.trim();
    const description = problemDescription.trim();
    if (!title) return;

    try {
      setSavingProblem(true);

      if (problemModalMode === "create") {
        await axios.post("/api/problems", { title, description }, { headers: authHeaders() });
      } else if (problemModalMode === "edit" && selectedProblem?.id != null) {
        await axios.put(
          `/api/problems/${selectedProblem.id}`,
          { title, description },
          { headers: authHeaders() }
        );
      }

      await fetchProblems();
      closeProblemModal();
    } catch (err) {
      console.error("save problem failed", err);
      setSavingProblem(false);
    }
  };

  const deleteProblem = async (p) => {
    if (!isAdmin) return;
    if (!p?.id) return;

    const ok = window.confirm("Удалить эту проблему?");
    if (!ok) return;

    try {
      await axios.delete(`/api/problems/${p.id}`, { headers: authHeaders() });
      await fetchProblems();
      if (selectedProblem?.id === p.id) closeProblemModal();
    } catch (err) {
      console.error("delete problem failed", err);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString();
  };

  const formatTime = (d) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const recentTasks = useMemo(
    () => (Array.isArray(stats?.recent_tasks) ? stats.recent_tasks : []),
    [stats]
  );

  // -----------------------------
  // UX Styles (Unified)
  // -----------------------------
  const LIST_HEIGHT = 340;
  const HEADER_HEIGHT = 64;

  const rowBase = {
    padding: "15px 20px",
    borderBottom: "1px solid #f1f5f9",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    transition: "background 0.15s ease",
  };

  // Header grid => fixed height for equal border line
  const sectionHeader = {
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    height: HEADER_HEIGHT,
  };

  const headerLeft = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  };

  const headerRight = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    justifyContent: "flex-end",
    whiteSpace: "nowrap",
    flexWrap: "nowrap",
  };

  const headerTitle = {
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
    lineHeight: 1.2,
    fontWeight: 800,
    color: "#0f172a",
  };

  const subtleActionBtn = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "8px 10px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#334155",
  };

  // Modal styles (updated to match cards)
  const modalOverlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "18px",
  };

  const modalCardStyle = {
    width: "min(620px, 95vw)",
    background: "white",
    borderRadius: "16px",
    boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
    overflow: "hidden",
  };

  const modalHeaderStyle = {
    padding: "16px 18px",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  };

  const modalTitleStyle = {
    fontWeight: 900,
    color: "#0f172a",
    fontSize: 14,
    letterSpacing: 0.2,
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const modalBodyStyle = { padding: "18px" };

  const modalLabel = {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
    marginBottom: 6,
  };

  const modalInput = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    outline: "none",
    fontSize: 14,
    color: "#0f172a",
  };

  const modalTextarea = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    outline: "none",
    resize: "vertical",
    fontSize: 14,
    color: "#0f172a",
    lineHeight: 1.5,
  };

  const modalMeta = {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: 600,
  };

  const modalContentBox = {
    marginTop: 8,
    padding: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    color: "#334155",
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    fontSize: 14,
  };

  const modalFooterActions = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  };

  const modalSecondaryBtn = {
    background: "white",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };

  const modalPrimaryBtn = {
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  };

  const modalDangerBtn = {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  };

  if (loading) return <div style={{ padding: 40 }}>Загрузка аналитики...</div>;

  return (
    <div style={{ width: "100%", paddingRight: "20px" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "30px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "32px",
              background: "linear-gradient(90deg, #2563eb, #3b82f6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Добро пожаловать, {username}!
          </h1>
          <p style={{ color: "#64748b", marginTop: "5px" }}>Вот обзор системы на сегодня.</p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            background: health.api === "Online" ? "#ecfdf5" : "#fef2f2",
            padding: "8px 15px",
            borderRadius: "20px",
            border: `1px solid ${health.api === "Online" ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              background: health.api === "Online" ? "#10b981" : "#ef4444",
              borderRadius: "50%",
              boxShadow: `0 0 5px ${health.api === "Online" ? "#10b981" : "#ef4444"}`,
            }}
          />
          <span
            style={{
              fontSize: "13px",
              color: health.api === "Online" ? "#065f46" : "#991b1b",
              fontWeight: 700,
            }}
          >
            {health.api === "Online" ? "System Stable" : "System Issues"}
          </span>
        </div>
      </div>

      {/* Top cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div
          className="card"
          style={{
            padding: "25px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            borderLeft: "4px solid #3b82f6",
          }}
        >
          <div style={{ background: "#eff6ff", padding: "15px", borderRadius: "12px" }}>
            <Clock size={30} color="#3b82f6" />
          </div>
          <div>
            <div style={{ fontSize: "32px", fontWeight: 900, color: "#1e293b" }}>
              {stats?.active_tasks || 0}
            </div>
            <div style={{ color: "#64748b", fontSize: "14px", fontWeight: 700 }}>
              Активных задач
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "25px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            borderLeft: "4px solid #8b5cf6",
          }}
        >
          <div style={{ background: "#f5f3ff", padding: "15px", borderRadius: "12px" }}>
            <Users size={30} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ fontSize: "32px", fontWeight: 900, color: "#1e293b" }}>
              {stats?.users || 0}
            </div>
            <div style={{ color: "#64748b", fontSize: "14px", fontWeight: 700 }}>
              Пользователей
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "25px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            borderLeft: "4px solid #10b981",
          }}
        >
          <div style={{ background: "#ecfdf5", padding: "15px", borderRadius: "12px" }}>
            <CheckCircle size={30} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: "32px", fontWeight: 900, color: "#1e293b" }}>
              {stats?.total_tasks || 0}
            </div>
            <div style={{ color: "#64748b", fontSize: "14px", fontWeight: 700 }}>
              Всего задач
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "30px" }}>
        {/* LEFT: 2 cards in 1 row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "20px",
            alignItems: "stretch",
          }}
        >
          {/* Активность */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={sectionHeader}>
              <div style={headerLeft}>
                <h3 style={headerTitle}>
                  <Activity size={20} color="#64748b" /> Активность
                </h3>
              </div>
              <div style={headerRight}>
                <Link
                  to="/departments"
                  style={{ fontSize: "13px", color: "#3b82f6", textDecoration: "none", fontWeight: 700 }}
                >
                  Все задачи →
                </Link>
              </div>
            </div>

            <div style={{ height: LIST_HEIGHT, overflow: "auto" }}>
              {recentTasks.length === 0 ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>
                  Нет недавней активности
                </div>
              ) : (
                recentTasks.map((task, idx) => (
                  <div
                    key={idx}
                    style={rowBase}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
                        Автор: {task.username} • {formatDate(task.created_at)}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "11px",
                        padding: "4px 8px",
                        borderRadius: "10px",
                        fontWeight: 800,
                        background:
                          task.status === "Done"
                            ? "#dcfce7"
                            : task.status === "In Progress"
                            ? "#dbeafe"
                            : "#f1f5f9",
                        color:
                          task.status === "Done"
                            ? "#166534"
                            : task.status === "In Progress"
                            ? "#1e40af"
                            : "#475569",
                        flexShrink: 0,
                      }}
                    >
                      {task.status === "Open"
                        ? "Новая"
                        : task.status === "In Progress"
                        ? "В работе"
                        : "Готово"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Problems */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={sectionHeader}>
              <div style={headerLeft}>
                <h3 style={headerTitle}>
                  <AlertTriangle size={20} color="#64748b" /> Active Problems
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                      color: "#475569",
                      whiteSpace: "nowrap",
                    }}
                    title="Количество активных проблем"
                  >
                    {problemsLoading ? "..." : problems.length}
                  </span>
                </h3>
              </div>

              <div style={headerRight}>
                {problemsUpdatedAt && (
                  <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>
                    обновлено {formatTime(problemsUpdatedAt)}
                  </span>
                )}

                <button
                  type="button"
                  onClick={fetchProblems}
                  title="Обновить список"
                  style={{
                    ...subtleActionBtn,
                    opacity: problemsLoading ? 0.7 : 1,
                  }}
                  disabled={problemsLoading}
                >
                  <RefreshCw size={16} />
                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {problemsLoading ? "..." : "Refresh"}
                  </span>
                </button>

                {isAdmin && (
                  <button
                    onClick={openCreateProblem}
                    className="btn"
                    style={{
                      padding: "8px 10px",
                      fontSize: "12px",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontWeight: 800,
                    }}
                    title="Добавить проблему"
                    type="button"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                )}
              </div>
            </div>

            <div style={{ height: LIST_HEIGHT, overflow: "auto" }}>
              {problemsLoading ? (
                <div style={{ padding: "20px", color: "#94a3b8", fontWeight: 700 }}>Загрузка проблем...</div>
              ) : problems.length === 0 ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>
                  Пока нет зафиксированных проблем
                </div>
              ) : (
                problems.map((p) => (
                  <div
                    key={p.id ?? `${p.title}-${p.created_at}`}
                    onClick={() => openViewProblem(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && openViewProblem(p)}
                    style={{ ...rowBase, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={p.title}
                      >
                        {p.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
                        {formatDate(p.created_at)}
                      </div>
                    </div>

                    {isAdmin && (
                      <div
                        style={{ display: "flex", gap: "10px", flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openEditProblem(p)}
                          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                          title="Редактировать"
                        >
                          <Edit2 size={16} color="#3b82f6" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProblem(p)}
                          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                          title="Удалить"
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Быстрый запуск</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link
                to="/sverka"
                className="btn"
                style={{ textAlign: "center", display: "block", textDecoration: "none" }}
              >
                <FileDiff size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} />
                Новая сверка
              </Link>

              <Link
                to="/departments"
                className="btn"
                style={{
                  background: "white",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  textAlign: "center",
                  display: "block",
                  textDecoration: "none",
                }}
              >
                <Plus size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} />
                Создать задачу
              </Link>
            </div>
          </div>

          <div className="card" style={{ background: "#1e293b", color: "white" }}>
            <h3 style={{ marginTop: 0, color: "white", fontSize: "16px" }}>Technical Status</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "15px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}>
                  <Server size={16} color={getStatusColor(health.api)} /> API Server
                </div>
                <span style={{ color: getStatusColor(health.api), fontSize: "12px", fontWeight: 800 }}>
                  {health.api}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}>
                  <Database size={16} color={getStatusColor(health.db)} /> PostgreSQL
                </div>
                <span style={{ color: getStatusColor(health.db), fontSize: "12px", fontWeight: 800 }}>
                  {health.db}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {problemModalOpen && (
        <div style={modalOverlayStyle} onClick={closeProblemModal}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div style={modalTitleStyle}>
                <AlertTriangle size={18} color="#64748b" />
                {problemModalMode === "create"
                  ? "Новая проблема"
                  : problemModalMode === "edit"
                  ? "Редактирование"
                  : "Описание проблемы"}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {isAdmin && problemModalMode === "view" && selectedProblem && (
                  <button
                    type="button"
                    onClick={() => openEditProblem(selectedProblem)}
                    style={{
                      ...subtleActionBtn,
                      borderColor: "#cbd5e1",
                      padding: "8px 10px",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                    title="Редактировать"
                  >
                    <Edit2 size={16} />
                    Edit
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeProblemModal}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Закрыть"
                >
                  <X size={20} color="#334155" />
                </button>
              </div>
            </div>

            <div style={modalBodyStyle}>
              {/* VIEW */}
              {problemModalMode === "view" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
                    {selectedProblem?.title}
                  </div>

                  {selectedProblem?.created_at && <div style={modalMeta}>{formatDate(selectedProblem.created_at)}</div>}

                  <div style={modalContentBox}>
                    {selectedProblem?.description || "Описание не указано."}
                  </div>

                  {isAdmin && selectedProblem && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => deleteProblem(selectedProblem)}
                        style={modalDangerBtn}
                      >
                        <Trash2 size={16} />
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* CREATE / EDIT */}
              {(problemModalMode === "create" || problemModalMode === "edit") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {!isAdmin ? (
                    <div
                      style={{
                        color: "#991b1b",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        padding: 12,
                        borderRadius: 12,
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      У вас нет прав для изменения проблем.
                    </div>
                  ) : (
                    <>
                      <div>
                        <div style={modalLabel}>Название</div>
                        <input
                          value={problemTitle}
                          onChange={(e) => setProblemTitle(e.target.value)}
                          placeholder="Например: Ошибка импорта сверки"
                          style={modalInput}
                        />
                      </div>

                      <div>
                        <div style={modalLabel}>Описание</div>
                        <textarea
                          value={problemDescription}
                          onChange={(e) => setProblemDescription(e.target.value)}
                          placeholder="Подробности проблемы, шаги воспроизведения, что должно быть и что происходит..."
                          rows={6}
                          style={modalTextarea}
                        />
                      </div>

                      <div style={modalFooterActions}>
                        <button
                          type="button"
                          onClick={closeProblemModal}
                          style={modalSecondaryBtn}
                          disabled={savingProblem}
                        >
                          Отмена
                        </button>

                        <button
                          type="button"
                          onClick={saveProblem}
                          className="btn"
                          style={{
                            ...modalPrimaryBtn,
                            opacity: savingProblem ? 0.7 : 1,
                          }}
                          disabled={savingProblem || !problemTitle.trim()}
                        >
                          <Save size={16} />
                          {savingProblem ? "Сохранение..." : "Сохранить"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
