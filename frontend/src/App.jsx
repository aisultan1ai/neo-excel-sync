import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
  useNavigate,
  useSearchParams,
  Outlet,
} from "react-router-dom";
import {
  FileDiff,
  Settings,
  FileSpreadsheet,
  Layers,
  Users,
  User,
  LayoutDashboard,
  Binary,
  Wallet,
} from "lucide-react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

import DashboardPage from "./pages/DashboardPage";
import SverkaPage from "./pages/SverkaPage";
import SplitsPage from "./pages/SplitsPage";
import SettingsPage from "./pages/SettingsPage";
import ReportsPage from "./pages/ReportsPage";
import LoginPage from "./pages/LoginPage";
import DepartmentsPage from "./pages/DepartmentsPage.jsx";
import ProfilePage from "./pages/ProfilePage";
import InstrumentsPage from "./pages/InstrumentsPage";
import AccountsPage from "./pages/AccountsPage";

// ---------------------------
// helpers
// ---------------------------
const getToken = () => localStorage.getItem("token");

// Подсветка меню: активна и на вложенных роутах
const isActivePath = (pathname, to) => {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
};

const NavButton = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const active = isActivePath(location.pathname, to);

  return (
    <Link to={to} className={`nav-btn ${active ? "active" : ""}`}>
      <Icon size={20} style={{ marginRight: "10px" }} />
      {label}
    </Link>
  );
};

// ---------------------------
// Protected guard (token check)
// ---------------------------
const ProtectedRoute = () => {
  const location = useLocation();
  const authed = !!getToken();

  if (!authed) {
    const next = location.pathname + location.search + location.hash;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <Outlet />;
};

// ---------------------------
// App Layout (sidebar + outlet)
// ---------------------------
const AppLayout = ({ onLogout }) => {
  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-area">
          <h2>NeoExcelSync</h2>
        </div>

        <nav className="nav-menu">
          <NavButton to="/" icon={LayoutDashboard} label="Главная" />
          <NavButton to="/sverka" icon={FileDiff} label="Сверка" />
          <NavButton to="/splits" icon={Layers} label="Сплиты" />
          <NavButton to="/reports" icon={FileSpreadsheet} label="Отчеты" />
          <NavButton to="/departments" icon={Users} label="Департаменты" />
          <NavButton to="/instruments" icon={Binary} label="Инструменты" />
          <NavButton to="/crypto" icon={Wallet} label="Крипто-счета" />

          <div className="spacer" style={{ flex: 1 }} />

          <NavButton to="/profile" icon={User} label="Профиль" />
          <NavButton to="/settings" icon={Settings} label="Настройки" />
        </nav>
      </aside>

      <main className="content-area">
        <Outlet />
      </main>

      {/* ОДИН toast container на всё приложение */}
      <ToastContainer position="bottom-right" theme="light" />
    </div>
  );
};

// ---------------------------
// Login wrapper (redirect to next)
// ---------------------------
const LoginRoute = ({ onLogin }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // если уже авторизован — не показываем логин
  useEffect(() => {
    if (getToken()) navigate("/", { replace: true });
  }, [navigate]);

  const handleLogin = () => {
    onLogin?.();

    const nextRaw = params.get("next");
    const next = nextRaw ? decodeURIComponent(nextRaw) : "/";

    // блокируем редиректы на API/служебные маршруты
    const blockedPrefixes = ["/token", "/api", "/health", "/docs", "/openapi"];
    const safeNext = blockedPrefixes.some(
      (p) => next === p || next.startsWith(p + "/")
    )
      ? "/"
      : next;

    navigate(safeNext, { replace: true });
  };

  return <LoginPage onLogin={handleLogin} />;
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
    setIsLoading(false);

    const onStorage = (e) => {
      if (e.key === "token") setAuthed(!!getToken());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setAuthed(false);
    // ProtectedRoute сам перекинет на /login
  };

  const handleLoginState = () => setAuthed(true);

  if (isLoading) return <div>Загрузка...</div>;

  return (
    <Router>
      <Routes>
        {/* public */}
        <Route path="/login" element={<LoginRoute onLogin={handleLoginState} />} />

        {/* protected */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout onLogout={handleLogout} />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sverka" element={<SverkaPage />} />
            <Route path="/splits" element={<SplitsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/instruments" element={<InstrumentsPage />} />
            <Route path="/crypto" element={<AccountsPage />} />
            <Route path="/profile" element={<ProfilePage onLogout={handleLogout} />} />
            <Route path="/settings" element={<SettingsPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
