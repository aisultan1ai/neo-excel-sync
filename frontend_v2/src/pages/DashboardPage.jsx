import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Users,
  Clock,
  FileDiff,
  Plus,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  Search,
  Loader2,
  FileText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";

import { api } from "../api/client";

const getLocalYMD = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("User");
  const [isAdmin, setIsAdmin] = useState(false);

  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [problemsUpdatedAt, setProblemsUpdatedAt] = useState(null);

  const [podft, setPodft] = useState({ count: 0, snapshot_id: null, snapshot_date: null });
  const [podftModalOpen, setPodftModalOpen] = useState(false);
  const [podftTrades, setPodftTrades] = useState([]);
  const [podftLoading, setPodftLoading] = useState(false);
  const [podftUpdatedAt, setPodftUpdatedAt] = useState(null);
  const [podftFilter, setPodftFilter] = useState("");

  async function fetchProfile() {
    const res = await api.get("/api/v2/profile");
    setUsername(res.data?.username || "User");
    setIsAdmin(!!res.data?.is_admin);
  }

  async function fetchDashboard() {
    const res = await api.get("/api/v2/dashboard");
    setStats(res.data || null);
  }

  async function fetchProblems() {
    try {
      setProblemsLoading(true);
      const res = await api.get("/api/v2/problems?limit=6");
      setProblems(Array.isArray(res.data) ? res.data : []);
      setProblemsUpdatedAt(new Date());
    } catch (err) {
      console.error(err);
      setProblems([]);
    } finally {
      setProblemsLoading(false);
    }
  }

  async function fetchPodftToday() {
    try {
      const day = getLocalYMD();
      const res = await api.get(`/api/v2/podft/today?snapshot_date=${encodeURIComponent(day)}`);

      if (res.data?.status === "success") {
        setPodft({
          count: Number(res.data?.count || 0),
          snapshot_id: res.data?.snapshot_id || null,
          snapshot_date: res.data?.snapshot_date || day,
        });
      } else {
        setPodft({ count: 0, snapshot_id: null, snapshot_date: day });
      }
    } catch (err) {
      console.error(err);
      setPodft({ count: 0, snapshot_id: null, snapshot_date: getLocalYMD() });
    }
  }

  async function fetchPodftTrades(snapshotId) {
    if (!snapshotId) {
      setPodftTrades([]);
      return;
    }

    try {
      setPodftLoading(true);
      const res = await api.get(`/api/v2/podft/trades?snapshot_id=${snapshotId}&limit=1000`);
      setPodftTrades(Array.isArray(res.data?.items) ? res.data.items : []);
      setPodftUpdatedAt(new Date());
    } catch (err) {
      console.error(err);
      setPodftTrades([]);
      setPodftUpdatedAt(new Date());
    } finally {
      setPodftLoading(false);
    }
  }

  async function openPodftModal() {
    setPodftModalOpen(true);
    setPodftFilter("");
    await fetchPodftTrades(podft.snapshot_id);
  }

  function closePodftModal() {
    setPodftModalOpen(false);
    setPodftTrades([]);
    setPodftFilter("");
    setPodftLoading(false);
  }

  async function loadAll() {
    try {
      setLoading(true);
      await Promise.all([fetchProfile(), fetchDashboard(), fetchProblems(), fetchPodftToday()]);
    } catch (err) {
      console.error(err);
      toast.error("Ошибка загрузки dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const recentTasks = useMemo(
    () => (Array.isArray(stats?.recent_tasks) ? stats.recent_tasks : []),
    [stats]
  );

  const filteredPodftTrades = useMemo(() => {
    const q = (podftFilter || "").trim().toLowerCase();
    if (!q) return podftTrades;

    return (podftTrades || []).filter((row) =>
      Object.values(row || {}).some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [podftFilter, podftTrades]);

  const podftColumns = useMemo(() => {
    if (!filteredPodftTrades.length) return [];
    const keys = new Set();
    filteredPodftTrades.slice(0, 100).forEach((r) =>
      Object.keys(r || {}).forEach((k) => keys.add(k))
    );
    return Array.from(keys);
  }, [filteredPodftTrades]);

  if (loading) {
    return (
      <div className="page">
        <div className="card">Загрузка аналитики...</div>
      </div>
    );
  }

  return (
    <div className="page dashboard-page-v2">
      <div className="dashboard-hero">
        <div>
          <h1>Добро пожаловать, {username}!</h1>
          <p>Краткий обзор системы и быстрые переходы по ключевым модулям.</p>
        </div>

        <button className="secondary-btn" onClick={loadAll} type="button">
          <RefreshCw size={16} />
          <span>Обновить</span>
        </button>
      </div>

      <div className="dashboard-stats-grid">
        <div className="card dashboard-stat-card blue">
          <div className="dashboard-stat-icon blue">
            <Clock size={28} />
          </div>
          <div>
            <div className="dashboard-stat-value">{stats?.active_tasks || 0}</div>
            <div className="dashboard-stat-label">Активных задач</div>
          </div>
        </div>

        <div className="card dashboard-stat-card violet">
          <div className="dashboard-stat-icon violet">
            <Users size={28} />
          </div>
          <div>
            <div className="dashboard-stat-value">{stats?.users || 0}</div>
            <div className="dashboard-stat-label">Пользователей</div>
          </div>
        </div>

        <div
          className="card dashboard-stat-card green clickable"
          role="button"
          tabIndex={0}
          onClick={openPodftModal}
          onKeyDown={(e) => e.key === "Enter" && openPodftModal()}
          title="Открыть список ПОД/ФТ сделок за сегодня"
        >
          <div className="dashboard-stat-icon green">
            <CheckCircle size={28} />
          </div>
          <div>
            <div className="dashboard-stat-value">{podft?.count || 0}</div>
            <div className="dashboard-stat-label">ПОД/ФТ сделки (сегодня)</div>
            <div className="dashboard-stat-sub">Нажми, чтобы открыть список</div>
          </div>
        </div>
      </div>

      <div className="dashboard-main-grid">
        <div className="dashboard-left-grid">
          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <h3>
                <Activity size={18} color="#64748b" /> Активность
              </h3>
              <Link to="/departments" className="dashboard-link-btn">
                Все задачи →
              </Link>
            </div>

            <div className="dashboard-list-fixed">
              {recentTasks.length === 0 ? (
                <div className="dashboard-empty">Нет недавней активности</div>
              ) : (
                recentTasks.map((task, idx) => (
                  <div key={idx} className="dashboard-list-row">
                    <div className="dashboard-list-main">
                      <div className="dashboard-list-title">{task.title}</div>
                      <div className="dashboard-list-meta">
                        Автор: {task.username} • {formatDate(task.created_at)}
                      </div>
                    </div>

                    <span
                      className={`dashboard-status-badge ${
                        task.status === "Done"
                          ? "done"
                          : task.status === "In Progress"
                          ? "progress"
                          : "open"
                      }`}
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

          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <h3>
                <AlertTriangle size={18} color="#64748b" /> Active Problems
                <span className="dashboard-count-chip">
                  {problemsLoading ? "..." : problems.length}
                </span>
              </h3>

              <div className="dashboard-panel-head-right">
                {problemsUpdatedAt && (
                  <span className="dashboard-meta-time">
                    обновлено {formatTime(problemsUpdatedAt)}
                  </span>
                )}

                <button
                  type="button"
                  onClick={fetchProblems}
                  className="secondary-btn small"
                  disabled={problemsLoading}
                >
                  <RefreshCw size={14} />
                  <span>{problemsLoading ? "..." : "Refresh"}</span>
                </button>

                <Link to="/problems" className="dashboard-link-btn">
                  Открыть →
                </Link>
              </div>
            </div>

            <div className="dashboard-list-fixed">
              {problemsLoading ? (
                <div className="dashboard-empty">Загрузка проблем...</div>
              ) : problems.length === 0 ? (
                <div className="dashboard-empty">Пока нет зафиксированных проблем</div>
              ) : (
                problems.map((p) => (
                  <Link key={p.id} to="/problems" className="dashboard-list-row link-row">
                    <div className="dashboard-list-main">
                      <div className="dashboard-list-title">{p.title}</div>
                      <div className="dashboard-list-meta">{formatDate(p.created_at)}</div>
                    </div>

                    {isAdmin && (
                      <span className="dashboard-problem-hint">
                        admin
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-right-col">
          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <h3>Быстрый запуск</h3>
            </div>

            <div className="dashboard-quick-grid">
              <Link to="/compare" className="dashboard-quick-btn primary">
                <FileDiff size={18} />
                <span>Новая сверка</span>
              </Link>

              <Link to="/departments" className="dashboard-quick-btn">
                <Plus size={18} />
                <span>Создать задачу</span>
              </Link>

              <Link to="/reports" className="dashboard-quick-btn">
                <FileText size={18} />
                <span>Клиентские отчеты</span>
              </Link>

              <Link to="/problems" className="dashboard-quick-btn">
                <AlertTriangle size={18} />
                <span>Реестр проблем</span>
              </Link>
            </div>
          </div>

          <div className="card dashboard-panel dashboard-dark-panel">
            <div className="dashboard-panel-head">
              <h3 className="white">Обзор</h3>
            </div>

            <div className="dashboard-tech-list">
              <div className="dashboard-tech-row">
                <span>Всего задач</span>
                <b>{stats?.total_tasks || 0}</b>
              </div>

              <div className="dashboard-tech-row">
                <span>Активных задач</span>
                <b>{stats?.active_tasks || 0}</b>
              </div>

              <div className="dashboard-tech-row">
                <span>Пользователей</span>
                <b>{stats?.users || 0}</b>
              </div>

              <div className="dashboard-tech-row">
                <span>Проблем в реестре</span>
                <b>{problems.length}</b>
              </div>

              <div className="dashboard-tech-row">
                <span>POD/FT сегодня</span>
                <b>{podft?.count || 0}</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      {podftModalOpen && (
        <div className="modal-backdrop" onClick={closePodftModal}>
          <div className="card dashboard-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard-modal-head">
              <div className="dashboard-modal-title">
                <CheckCircle size={16} color="#10b981" />
                ПОД/ФТ сделки за {podft?.snapshot_date || getLocalYMD()}
                <span className="dashboard-count-chip">{podftTrades.length}</span>
              </div>

              <div className="dashboard-modal-actions">
                {podftUpdatedAt && (
                  <span className="dashboard-meta-time">
                    обновлено {formatTime(podftUpdatedAt)}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => fetchPodftTrades(podft?.snapshot_id)}
                  className="secondary-btn small"
                  disabled={podftLoading}
                >
                  {podftLoading ? <Loader2 size={14} className="dashboard-spin" /> : <RefreshCw size={14} />}
                  <span>{podftLoading ? "..." : "Refresh"}</span>
                </button>

                <button type="button" className="icon-btn" onClick={closePodftModal}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="dashboard-modal-body">
              <div className="dashboard-search-box modal">
                <Search size={16} color="#94a3b8" />
                <input
                  value={podftFilter}
                  onChange={(e) => setPodftFilter(e.target.value)}
                  placeholder="Фильтр по всем колонкам..."
                />
              </div>

              {podftLoading ? (
                <div className="dashboard-empty">Загрузка сделок...</div>
              ) : filteredPodftTrades.length === 0 ? (
                <div className="dashboard-empty">Сделок нет или фильтр слишком строгий</div>
              ) : (
                <div className="dashboard-podft-table-wrap">
                  <table className="dashboard-podft-table">
                    <thead>
                      <tr>
                        {podftColumns.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPodftTrades.slice(0, 2000).map((row, idx) => (
                        <tr key={idx}>
                          {podftColumns.map((h) => (
                            <td key={h}>{String(row?.[h] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {filteredPodftTrades.length > 2000 && (
                    <div className="dashboard-table-note">
                      Показаны первые 2000 строк из {filteredPodftTrades.length}. Уточните фильтр.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}