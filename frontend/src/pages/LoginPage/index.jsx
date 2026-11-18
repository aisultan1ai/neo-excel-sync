import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import axios from "axios";
import BrandMark from "../../components/BrandMark";
import DotField from "../../components/DotField";

const http = axios.create({ baseURL: "/api/v1", timeout: 15000 });

const STATUS = {
  ONLINE:   { text: "SYSTEM ONLINE",       dot: "#3CC8B4", ring: "rgba(60,200,180,0.18)" },
  CHECKING: { text: "CHECKING SYSTEM...",  dot: "#F2B36B", ring: "rgba(242,179,107,0.18)" },
  OFFLINE:  { text: "SYSTEM OFFLINE",      dot: "#F27A6B", ring: "rgba(242,122,107,0.2)" },
};

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState("CHECKING");

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) { setError("Пожалуйста, введите логин и пароль"); return; }
    setLoading(true);
    try {
      const body = new URLSearchParams();
      body.append("username", username.trim());
      body.append("password", password);
      const res = await http.post("/token", body, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!res?.data?.access_token) { setError("Ошибка входа. Попробуйте снова."); return; }
      onLogin?.();
      const nextRaw = params.get("next");
      const next = nextRaw ? decodeURIComponent(nextRaw) : "/";
      const blockedPrefixes = ["/token", "/api", "/health", "/docs", "/openapi"];
      const safeNext = blockedPrefixes.some((p) => next === p || next.startsWith(p + "/")) ? "/" : next;
      navigate(safeNext, { replace: true });
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) setError("Неверный логин или пароль");
      else if (status) setError(typeof detail === "string" ? detail : `Ошибка сервера (${status})`);
      else setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const st = STATUS[systemStatus] || STATUS.CHECKING;

  const inputStyle = {
    width: "100%", height: 48, padding: "0 16px", borderRadius: 12,
    border: "1px solid #C9D6D8", background: "#F5F8F8", color: "#0E1A1C",
    fontSize: 15, fontFamily: "inherit",
  };
  const labelStyle = { display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "#33464A" };
  const pad = "clamp(24px, 4vw, 56px)";

  return (
    <div style={{ minHeight: "100vh", width: "100%", boxSizing: "border-box", display: "flex", flexWrap: "wrap", background: "#F4F7F7", fontFamily: "var(--font-sans)" }}>

      {/* Левая половина: тёмная панель с полем точек, логотип, заголовок */}
      <section className="login-col" style={{ position: "relative", overflow: "hidden", flex: "1 1 520px", display: "flex", flexDirection: "column", padding: pad, boxSizing: "border-box", background: "var(--ink-950)", color: "var(--text-on-dark)" }}>
        <DotField variant="dark" spacing={9} focusX={0.7} focusY={0.4} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(90deg, rgba(7,13,15,0.88) 0%, rgba(7,13,15,0.5) 45%, rgba(7,13,15,0.25) 85%)" }} />

        <header style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={34} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>NeoCore</span>
            <span style={{ fontSize: 11, color: "var(--muted-on-dark)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Back Office Platform</span>
          </div>
        </header>

        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 24, maxWidth: 620, padding: "48px 0" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "clamp(32px, 3.2vw, 50px)", lineHeight: 1.08, letterSpacing: "-0.03em" }}>
            Операционная платформа<br />для NeoMarkets Ltd
          </h1>
          <p style={{ margin: 0, maxWidth: 540, fontSize: 17, lineHeight: 1.6, color: "#F1F6F7" }}>
            Автоматизированная система для брокерской компании — единое пространство для обработки и управления данными с использованием интеллектуальных алгоритмов нечёткого поиска.
          </p>
        </div>

        <footer style={{ position: "relative", fontSize: 12, color: "var(--muted-on-dark)" }}>NeoCore · внутренняя платформа</footer>
      </section>

      {/* Правая половина: светлая, карточка входа по центру */}
      <section className="login-col" style={{ position: "relative", flex: "1 1 520px", display: "flex", flexDirection: "column", padding: pad, boxSizing: "border-box", background: "#F4F7F7", color: "#0E1A1C" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", border: `1px solid ${systemStatus === "OFFLINE" ? "#F5C9C1" : "#D3DDDF"}`, borderRadius: 999, background: "#FFFFFF" }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, boxShadow: `0 0 0 4px ${st.ring}` }} />
            <span style={{ color: "#2B3D41", fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>{st.text}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
          <form onSubmit={handleSubmit} noValidate style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18, padding: 32, borderRadius: 24, background: "#FFFFFF", color: "#0E1A1C", border: "1px solid #D3DDDF", boxShadow: "0 16px 48px rgba(14,26,28,0.08)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 26, letterSpacing: "-0.02em", color: "#04201C" }}>Вход</h2>
              <p style={{ margin: 0, fontSize: 14, color: "#56676B" }}>Используйте логин, выданный администратором</p>
            </div>

            <div>
              <label htmlFor="login-username" style={labelStyle}>Логин</label>
              <input id="login-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ваш логин" autoComplete="username" style={inputStyle} />
            </div>

            <div>
              <label htmlFor="login-password" style={labelStyle}>Пароль</label>
              <div style={{ position: "relative" }}>
                <input id="login-password" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" style={{ ...inputStyle, paddingRight: 52 }} />
                <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? "Скрыть пароль" : "Показать пароль"} style={{ position: "absolute", right: 2, top: 2, width: 44, height: 44, border: "none", background: "transparent", color: "#56676B", cursor: "pointer", display: "grid", placeItems: "center", borderRadius: 10 }}>
                  {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" style={{ background: "#FDF1EF", color: "#A23B2C", border: "1px solid #F5C9C1", padding: "10px 12px", borderRadius: 10, fontSize: 13, textAlign: "center" }}>
                {error}
              </div>
            )}

            <button disabled={loading} type="submit" style={{ height: 52, marginTop: 4, border: "none", borderRadius: 999, background: "var(--accent-700)", color: "#FFFFFF", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: loading ? 0.85 : 1 }}>
              {loading
                ? <><Loader2 size={18} style={{ animation: "login-spin 1s linear infinite" }} /><span>Вход...</span></>
                : <><span>Войти</span><ArrowRight size={18} /></>}
            </button>

            <p style={{ margin: 0, fontSize: 13, color: "#56676B", textAlign: "center" }}>Нет доступа? Обратитесь к администратору платформы.</p>
          </form>
        </div>

        <footer style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, color: "#4F6064" }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>v1.1</span>
        </footer>
      </section>

      <style>{`
        @keyframes login-spin { to { transform: rotate(360deg); } }
        /* на широком экране половины во всю высоту; когда встают друг под другом — по содержимому */
        .login-col { min-height: 100vh; }
        @media (max-width: 1040px) { .login-col { min-height: auto; } }
      `}</style>
    </div>
  );
};

export default LoginPage;
