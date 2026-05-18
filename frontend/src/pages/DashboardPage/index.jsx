import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Activity, Users, Clock, FileDiff, Plus, Server, Database, AlertTriangle, RefreshCw, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { getLocalYMD } from "./helpers";
import { checkSystemHealth, fetchProblems, fetchPodftToday, fetchPodftTrades, fetchDashboard, saveProblemApi, deleteProblemApi } from "./api";
import PodftModal from "./PodftModal";
import ProblemModal from "./ProblemModal";

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("User");
  const [isAdmin, setIsAdmin] = useState(false);
  const [health, setHealth] = useState({ api: "Checking...", db: "Checking..." });
  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [problemsUpdatedAt, setProblemsUpdatedAt] = useState(null);
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [problemModalMode, setProblemModalMode] = useState("view");
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [podft, setPodft] = useState({ count: 0, date: null });
  const [podftModalOpen, setPodftModalOpen] = useState(false);
  const [podftTrades, setPodftTrades] = useState([]);
  const [podftLoading, setPodftLoading] = useState(false);
  const [podftUpdatedAt, setPodftUpdatedAt] = useState(null);

  const loadHealth = useCallback(async () => {
    setHealth(await checkSystemHealth());
  }, []);

  const loadProblems = useCallback(async () => {
    try {
      setProblemsLoading(true);
      setProblems(await fetchProblems());
      setProblemsUpdatedAt(new Date());
    } catch { setProblems([]); }
    finally { setProblemsLoading(false); }
  }, []);

  const loadPodftTrades = useCallback(async (dateStr) => {
    const day = dateStr || podft.date || getLocalYMD();
    try {
      setPodftLoading(true);
      setPodftTrades(await fetchPodftTrades(day));
      setPodftUpdatedAt(new Date());
    } catch {
      setPodftTrades([]);
      setPodftUpdatedAt(new Date());
    } finally { setPodftLoading(false); }
  }, [podft.date]);

  const loadDashboard = useCallback(async () => {
    try {
      const { stats: s, username: u, isAdmin: a } = await fetchDashboard();
      setUsername(u);
      setIsAdmin(a);
      setStats(s);
      await Promise.all([loadProblems(), fetchPodftToday().then(setPodft).catch(() => {})]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [loadProblems]);

  useEffect(() => {
    loadDashboard();
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard, loadHealth]);

  const getStatusColor = (status) => {
    if (status === "Online" || status === "Connected") return "#4ade80";
    if (status === "Checking...") return "#94a3b8";
    return "#ef4444";
  };

  const openViewProblem = (p) => { setSelectedProblem(p); setProblemModalMode("view"); setProblemModalOpen(true); };
  const openCreateProblem = () => { setSelectedProblem(null); setProblemModalMode("create"); setProblemModalOpen(true); };
  const openEditProblem = (p) => { setSelectedProblem(p); setProblemModalMode("edit"); setProblemModalOpen(true); };
  const closeProblemModal = () => { setProblemModalOpen(false); setSelectedProblem(null); };

  const handleProblemSaved = async (action, data) => {
    if (!isAdmin) return;
    try {
      if (action === "delete") {
        if (!window.confirm("Удалить эту проблему?")) return;
        await deleteProblemApi(data.id);
      } else {
        await saveProblemApi(action, data.id, data.title, data.description);
      }
      await loadProblems();
      closeProblemModal();
    } catch (err) { console.error(err); }
  };

  const openPodftModal = async () => {
    setPodftModalOpen(true);
    await loadPodftTrades(podft.date || getLocalYMD());
  };

  const formatDate = (iso) => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return d.toLocaleDateString(); };
  const formatTime = (d) => { if (!d) return ""; try { return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  const recentTasks = useMemo(() => (Array.isArray(stats?.recent_tasks) ? stats.recent_tasks : []), [stats]);

  const LIST_HEIGHT = 340;
  const HEADER_HEIGHT = 64;
  const sectionHeader = { padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", height: HEADER_HEIGHT, gap: "12px" };
  const headerLeft = { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 };
  const headerRight = { display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-end", whiteSpace: "nowrap", flexWrap: "nowrap" };
  const headerTitle = { margin: 0, display: "flex", alignItems: "center", gap: "10px", minWidth: 0, color: "#0f172a", fontSize: "16px", fontWeight: 700, lineHeight: 1.2 };
  const rowBase = { padding: "15px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", transition: "background 0.15s ease" };
  const subtleActionBtn = { background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", color: "#334155" };
  const badgeCount = { marginLeft: 8, fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#475569", whiteSpace: "nowrap" };

  if (loading) return <div style={{ padding: 40 }}>Загрузка аналитики...</div>;

  return (
    <div style={{ width: "100%", paddingRight: "20px" }}>
      <div style={{ marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "32px", background: "linear-gradient(90deg, #2563eb, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Добро пожаловать, {username}!
          </h1>
          <p style={{ color: "#64748b", marginTop: "5px" }}>Вот обзор системы на сегодня.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", background: health.api === "Online" ? "#ecfdf5" : "#fef2f2", padding: "8px 15px", borderRadius: "20px", border: `1px solid ${health.api === "Online" ? "#a7f3d0" : "#fecaca"}` }}>
          <div style={{ width: "8px", height: "8px", background: health.api === "Online" ? "#10b981" : "#ef4444", borderRadius: "50%", boxShadow: `0 0 5px ${health.api === "Online" ? "#10b981" : "#ef4444"}` }} />
          <span style={{ fontSize: "13px", color: health.api === "Online" ? "#065f46" : "#991b1b", fontWeight: 600 }}>
            {health.api === "Online" ? "System Stable" : "System Issues"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "30px" }}>
        <div className="card" style={{ padding: "25px", display: "flex", alignItems: "center", gap: "20px", borderLeft: "4px solid #3b82f6" }}>
          <div style={{ background: "#eff6ff", padding: "15px", borderRadius: "12px" }}><Clock size={30} color="#3b82f6" /></div>
          <div><div style={{ fontSize: "32px", fontWeight: 800, color: "#1e293b" }}>{stats?.active_tasks || 0}</div><div style={{ color: "#64748b", fontSize: "14px" }}>Активных задач</div></div>
        </div>
        <div className="card" style={{ padding: "25px", display: "flex", alignItems: "center", gap: "20px", borderLeft: "4px solid #8b5cf6" }}>
          <div style={{ background: "#f5f3ff", padding: "15px", borderRadius: "12px" }}><Users size={30} color="#8b5cf6" /></div>
          <div><div style={{ fontSize: "32px", fontWeight: 800, color: "#1e293b" }}>{stats?.users || 0}</div><div style={{ color: "#64748b", fontSize: "14px" }}>Пользователей</div></div>
        </div>
        <div className="card" role="button" tabIndex={0} onClick={openPodftModal} onKeyDown={(e) => e.key === "Enter" && openPodftModal()} style={{ padding: "25px", display: "flex", alignItems: "center", gap: "20px", borderLeft: "4px solid #10b981", cursor: "pointer", userSelect: "none" }} title="Открыть список ПОД/ФТ сделок за сегодня">
          <div style={{ background: "#ecfdf5", padding: "15px", borderRadius: "12px" }}><CheckCircle size={30} color="#10b981" /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#1e293b" }}>{podft?.count || 0}</div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>ПОД/ФТ сделки (сегодня)</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>Нажми чтобы открыть список</div>
          </div>
          <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12, whiteSpace: "nowrap" }}>{podft?.date ? podft.date : getLocalYMD()}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "30px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px", alignItems: "stretch" }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={sectionHeader}>
              <div style={headerLeft}><h3 style={headerTitle}><Activity size={20} color="#64748b" /> Активность</h3></div>
              <div style={headerRight}><Link to="/departments" style={{ fontSize: "13px", color: "#3b82f6", textDecoration: "none" }}>Все задачи →</Link></div>
            </div>
            <div style={{ height: LIST_HEIGHT, overflow: "auto" }}>
              {recentTasks.length === 0 ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>Нет недавней активности</div>
              ) : recentTasks.map((task, idx) => (
                <div key={idx} style={rowBase} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>Автор: {task.username} • {formatDate(task.created_at)}</div>
                  </div>
                  <span style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "10px", fontWeight: 600, background: task.status === "Done" ? "#dcfce7" : task.status === "In Progress" ? "#dbeafe" : "#f1f5f9", color: task.status === "Done" ? "#166534" : task.status === "In Progress" ? "#1e40af" : "#475569", flexShrink: 0 }}>
                    {task.status === "Open" ? "Новая" : task.status === "In Progress" ? "В работе" : "Готово"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={sectionHeader}>
              <div style={headerLeft}>
                <h3 style={headerTitle}>
                  <AlertTriangle size={20} color="#64748b" /> Active Problems
                  <span style={badgeCount} title="Количество активных проблем">{problemsLoading ? "..." : problems.length}</span>
                </h3>
              </div>
              <div style={headerRight}>
                {problemsUpdatedAt && <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>обновлено {formatTime(problemsUpdatedAt)}</span>}
                <button type="button" onClick={loadProblems} title="Обновить список" style={{ ...subtleActionBtn, opacity: problemsLoading ? 0.7 : 1 }} disabled={problemsLoading}>
                  <RefreshCw size={16} /><span style={{ fontSize: 12, fontWeight: 600 }}>{problemsLoading ? "..." : "Refresh"}</span>
                </button>
                {isAdmin && (
                  <button onClick={openCreateProblem} className="btn" style={{ padding: "8px 10px", fontSize: "12px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px" }} type="button">
                    <Plus size={16} /> Add
                  </button>
                )}
              </div>
            </div>
            <div style={{ height: LIST_HEIGHT, overflow: "auto" }}>
              {problemsLoading ? <div style={{ padding: "20px", color: "#94a3b8" }}>Загрузка проблем...</div>
                : problems.length === 0 ? <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>Пока нет зафиксированных проблем</div>
                : problems.map((p) => (
                  <div key={p.id ?? `${p.title}-${p.created_at}`} onClick={() => openViewProblem(p)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openViewProblem(p)} style={{ ...rowBase, cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      <div style={{ fontSize: "12px", color: "#94a3b8" }}>{formatDate(p.created_at)}</div>
                    </div>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: "10px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => openEditProblem(p)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }} title="Редактировать">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" onClick={() => handleProblemSaved("delete", p)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }} title="Удалить">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Быстрый запуск</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link to="/sverka" className="btn" style={{ textAlign: "center", display: "block", textDecoration: "none" }}>
                <FileDiff size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} /> Новая сверка
              </Link>
              <Link to="/departments" className="btn" style={{ background: "white", color: "#334155", border: "1px solid #cbd5e1", textAlign: "center", display: "block", textDecoration: "none" }}>
                <Plus size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} /> Создать задачу
              </Link>
            </div>
          </div>
          <div className="card" style={{ background: "#1e293b", color: "white" }}>
            <h3 style={{ marginTop: 0, color: "white", fontSize: "16px" }}>Technical Status</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "15px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}><Server size={16} color={getStatusColor(health.api)} /> API Server</div>
                <span style={{ color: getStatusColor(health.api), fontSize: "12px", fontWeight: 600 }}>{health.api}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}><Database size={16} color={getStatusColor(health.db)} /> PostgreSQL</div>
                <span style={{ color: getStatusColor(health.db), fontSize: "12px", fontWeight: 600 }}>{health.db}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {podftModalOpen && <PodftModal podft={podft} podftTrades={podftTrades} podftLoading={podftLoading} podftUpdatedAt={podftUpdatedAt} onClose={() => { setPodftModalOpen(false); setPodftTrades([]); setPodftLoading(false); }} onRefresh={loadPodftTrades} getLocalYMD={getLocalYMD} />}
      {problemModalOpen && <ProblemModal open={problemModalOpen} mode={problemModalMode} problem={selectedProblem} isAdmin={isAdmin} onClose={closeProblemModal} onSaved={handleProblemSaved} onEditMode={openEditProblem} />}

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .spin-anim { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
};

export default DashboardPage;
