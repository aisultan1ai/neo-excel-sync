import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Activity,
  Users,
  CheckCircle,
  Clock,
  FileDiff,
  Plus,
  ArrowRight,
  Server,
  Database,
} from "lucide-react";
import { Link } from "react-router-dom";

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("User");

  const [health, setHealth] = useState({ api: "Checking...", db: "Checking..." });

  useEffect(() => {
    fetchDashboard();
    checkSystemHealth();

    const interval = setInterval(checkSystemHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkSystemHealth = async () => {
    try {
      const res = await axios.get("/api/health", { timeout: 2000 });
      setHealth(res.data);
    } catch (err) {
      setHealth({ api: "Offline", db: "Disconnected" });
    }
  };

  const fetchDashboard = async () => {
    try {
      const token = localStorage.getItem("token");

      const resProfile = await axios.get("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsername(resProfile.data.username);

      const res = await axios.get("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data);
      setLoading(false);
    } catch (err) {
      console.error("request failed", err);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === "Online" || status === "Connected") return "#4ade80"; // Green
    if (status === "Checking...") return "#94a3b8"; // Grey
    return "#ef4444"; // Red (Offline/Error)
  };
  if (loading) return <div style={{ padding: 40 }}>Загрузка аналитики...</div>;

  return (
    <div style={{ width: "100%", paddingRight: "20px" }}>
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
          ></div>
          <span
            style={{
              fontSize: "13px",
              color: health.api === "Online" ? "#065f46" : "#991b1b",
              fontWeight: 600,
            }}
          >
            {health.api === "Online" ? "System Stable" : "System Issues"}
          </span>
        </div>
      </div>

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
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#1e293b" }}>
              {stats?.active_tasks || 0}
            </div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>Активных задач</div>
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
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#1e293b" }}>
              {stats?.users || 0}
            </div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>Пользователей</div>
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
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#1e293b" }}>
              {stats?.total_tasks || 0}
            </div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>Всего задач</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "30px" }}>
        {/* ЛЕВАЯ КОЛОНКА: ПОСЛЕДНИЕ ЗАДАЧИ */}
        <div className="card" style={{ padding: "0", overflow: "hidden" }}>
          <div
            style={{
              padding: "20px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
              <Activity size={20} color="#64748b" /> Активность
            </h3>
            <Link
              to="/departments"
              style={{ fontSize: "13px", color: "#3b82f6", textDecoration: "none" }}
            >
              Все задачи →
            </Link>
          </div>

          <div>
            {stats?.recent_tasks?.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                Нет недавней активности
              </div>
            ) : (
              stats?.recent_tasks.map((task, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "15px 20px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#334155" }}>{task.title}</div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Автор: {task.username} • {new Date(task.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                      borderRadius: "10px",
                      fontWeight: 600,
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

        {/* ПРАВАЯ КОЛОНКА: БЫСТРЫЕ ДЕЙСТВИЯ И СТАТУС */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Быстрый запуск */}
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

          {/* Технический статус */}
          <div className="card" style={{ background: "#1e293b", color: "white" }}>
            <h3 style={{ marginTop: 0, color: "white", fontSize: "16px" }}>Technical Status</h3>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "15px" }}
            >
              {/* API Status */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}
                >
                  <Server size={16} color={getStatusColor(health.api)} /> API Server
                </div>
                <span
                  style={{ color: getStatusColor(health.api), fontSize: "12px", fontWeight: 600 }}
                >
                  {health.api}
                </span>
              </div>

              {/* DB Status */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}
                >
                  <Database size={16} color={getStatusColor(health.db)} /> PostgreSQL
                </div>
                <span
                  style={{ color: getStatusColor(health.db), fontSize: "12px", fontWeight: 600 }}
                >
                  {health.db}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
