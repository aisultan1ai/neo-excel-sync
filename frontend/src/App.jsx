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
  LogOut,
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
const ProtectedRoute = ({ token }) => {
  const location = useLocation();
  const authed = !!token;

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

          {/* logout: чтобы onLogout использовался и было удобно юзеру */}
          <button className="nav-btn" type="button" onClick={onLogout}>
            <LogOut size={20} style={{ marginRight: "10px" }} />
            Выйти
          </button>
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
const LoginRoute = ({ token, onLogin }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // если уже авторизован — не показываем логин
  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token, navigate]);

  const handleLogin = () => {
    onLogin?.();

    const nextRaw = params.get("next");
    const next = nextRaw ? decodeURIComponent(nextRaw) : "/";

    // блокируем редиректы на API/служебные маршруты
    const blockedPrefixes = ["/token", "/api", "/health", "/docs", "/openapi"];
    const safeNext = blockedPrefixes.some((p) => next === p || next.startsWith(p + "/"))
      ? "/"
      : next;

    navigate(safeNext, { replace: true });
  };

  return <LoginPage onLogin={handleLogin} />;
};

function App() {
  const [isLoading, setIsLoading] = useState(true);

  // источник истины: token
  const [token, setToken] = useState(() => getToken());

  useEffect(() => {
    setIsLoading(false);

    // изменения token из другой вкладки
    const onStorage = (e) => {
      if (e.key === "token") setToken(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
  };

  const handleLoginState = () => {
    // LoginPage сохраняет token в localStorage → подтягиваем сюда
    setToken(getToken());
  };

  if (isLoading) return <div>Загрузка...</div>;

  return (
    <Router>
      <Routes>
        {/* public */}
        <Route path="/login" element={<LoginRoute token={token} onLogin={handleLoginState} />} />

        {/* protected */}
        <Route element={<ProtectedRoute token={token} />}>
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
