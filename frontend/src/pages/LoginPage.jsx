import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Zap, BarChart3, User, Lock, ArrowRight } from "lucide-react";
import axios from "axios";

const http = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState("CHECKING");

  // Проверка доступности backend
  useEffect(() => {
    const checkHealth = async () => {
      try {

        await http.get("/health", { timeout: 2500 });
        setSystemStatus("ONLINE");
      } catch (err) {
        console.error("Health check failed", err);
        setSystemStatus("OFFLINE");
      }
    };
    checkHealth();
  }, []);

  // если токен уже есть — не показываем логин
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const nextRaw = params.get("next");
    const next = nextRaw ? decodeURIComponent(nextRaw) : "/";

    const blockedPrefixes = ["/token", "/api", "/health", "/docs", "/openapi"];
    const safeNext = blockedPrefixes.some((p) => next === p || next.startsWith(p + "/"))
      ? "/"
      : next;

    navigate(safeNext, { replace: true });
  }, [navigate, params]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Пожалуйста, введите логин и пароль");
      return;
    }

    setLoading(true);

    try {
      const body = new URLSearchParams();
      body.append("username", username.trim());
      body.append("password", password);

      const res = await http.post("/token", body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const token = res?.data?.access_token;
      if (!token) {
        setError("Не удалось получить токен (нет access_token в ответе).");
        return;
      }

      localStorage.setItem("token", token);
      onLogin?.();

      const nextRaw = params.get("next");
      const next = nextRaw ? decodeURIComponent(nextRaw) : "/";

      const blockedPrefixes = ["/token", "/api", "/health", "/docs", "/openapi"];
      const safeNext = blockedPrefixes.some((p) => next === p || next.startsWith(p + "/"))
        ? "/"
        : next;

      navigate(safeNext, { replace: true });
    } catch (err) {
      console.error(err);

      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 401) {
        setError(typeof detail === "string" ? detail : "Неверный логин или пароль");
      } else if (status === 405) {
        setError("Ошибка 405: неверный адрес запроса. Проверь, что фронт шлёт POST на /api/token.");
      } else if (status === 422) {
        setError("Ошибка 422: backend не принял форму. Проверь формат x-www-form-urlencoded.");
      } else if (status) {
        setError(typeof detail === "string" ? detail : `Ошибка сервера (${status})`);
      } else {
        setError("Ошибка соединения с сервером");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ display: "flex", height: "100vh", width: "100vw", fontFamily: "Inter, sans-serif" }}
    >
      {/* --- LEFT --- */}
      <div
        style={{
          flex: 1,
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-10%",
            width: "300px",
            height: "300px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "-5%",
            width: "200px",
            height: "200px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "50%",
          }}
        />

        <div style={{ maxWidth: "500px", zIndex: 2 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(255,255,255,0.1)",
              padding: "8px 16px",
              borderRadius: "20px",
              marginBottom: "20px",
              border: systemStatus === "OFFLINE" ? "1px solid rgba(239, 68, 68, 0.5)" : "none",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background:
                  systemStatus === "ONLINE"
                    ? "#4ade80"
                    : systemStatus === "CHECKING"
                      ? "#fbbf24"
                      : "#ef4444",
                boxShadow: systemStatus === "ONLINE" ? "0 0 10px #4ade80" : "none",
              }}
            />
            <span
              style={{ fontSize: "12px", letterSpacing: "1px", fontWeight: 600, color: "white" }}
            >
              {systemStatus === "ONLINE"
                ? "SYSTEM ONLINE"
                : systemStatus === "CHECKING"
                  ? "CHECKING SYSTEM..."
                  : "SYSTEM OFFLINE"}
            </span>
          </div>

          <h1
            style={{ fontSize: "60px", fontWeight: 800, marginBottom: "20px", lineHeight: "1.1" }}
          >
            NeoExcelSync <span style={{ color: "#60a5fa" }}>Platform</span>
          </h1>

          <p
            style={{ fontSize: "18px", color: "#94a3b8", marginBottom: "40px", lineHeight: "1.6" }}
          >
            Автоматизированная система сверки брокерских отчетов. Единое пространство для обработки
            данных Unity и АИС с поддержкой сплитов и алгоритмов нечеткого поиска.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FeatureItem
              icon={Zap}
              title="Молниеносная обработка"
              desc="Парсинг тысяч строк Excel за секунды"
            />
            <FeatureItem
              icon={ShieldCheck}
              title="Безопасность данных"
              desc="Локальная обработка и защищенный доступ"
            />
            <FeatureItem
              icon={BarChart3}
              title="Умная аналитика"
              desc="Автоматическое выявление расхождений"
            />
          </div>
        </div>
      </div>

      {/* --- RIGHT --- */}
      <div
        style={{
          flex: 1,
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <div style={{ marginBottom: "30px", textAlign: "center" }}>
            <h2 style={{ fontSize: "28px", color: "#0f172a", marginBottom: "10px" }}>
              Добро пожаловать!
            </h2>
            <p style={{ color: "#64748b" }}>Пожалуйста, войдите в свой аккаунт</p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              background: "white",
              padding: "40px",
              borderRadius: "16px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            }}
          >
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 500,
                  color: "#334155",
                  fontSize: "14px",
                }}
              >
                Логин
              </label>
              <div style={{ position: "relative" }}>
                <User
                  size={18}
                  style={{ position: "absolute", left: "12px", top: "12px", color: "#94a3b8" }}
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="name"
                  autoComplete="username"
                  style={{
                    width: "100%",
                    padding: "10px 10px 10px 40px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    outline: "none",
                    fontSize: "15px",
                    color: "#1e293b",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                  onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
                />
              </div>
            </div>

            <div style={{ marginBottom: "25px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 500,
                  color: "#334155",
                  fontSize: "14px",
                }}
              >
                Пароль
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={18}
                  style={{ position: "absolute", left: "12px", top: "12px", color: "#94a3b8" }}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: "100%",
                    padding: "10px 10px 10px 40px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    outline: "none",
                    fontSize: "15px",
                    color: "#1e293b",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                  onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
                />
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#ef4444",
                  padding: "10px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  marginBottom: "20px",
                  textAlign: "center",
                }}
              >
                {error}
              </div>
            )}

            <button
              disabled={loading}
              type="submit"
              style={{
                width: "100%",
                background: "#2563eb",
                color: "white",
                border: "none",
                padding: "12px",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "background 0.2s",
                opacity: loading ? 0.85 : 1,
              }}
              onMouseOver={(e) => !loading && (e.currentTarget.style.background = "#1d4ed8")}
              onMouseOut={(e) => !loading && (e.currentTarget.style.background = "#2563eb")}
            >
              {loading ? (
                "Вход..."
              ) : (
                <>
                  Войти в систему <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div
            style={{ marginTop: "20px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}
          >
            © 2025 NeoExcelSync. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureItem = ({ icon: Icon, title, desc }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
    <div
      style={{
        background: "rgba(255,255,255,0.1)",
        padding: "10px",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={24} color="#60a5fa" />
    </div>
    <div>
      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{title}</h4>
      <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>{desc}</p>
    </div>
  </div>
);

export default LoginPage;
