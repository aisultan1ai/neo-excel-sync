import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
  useNavigate,
  useSearchParams,
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
// пример: /crypto/123 тоже подсветит кнопку /crypto
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

// Гард: если нет токена — кидаем на /login?next=...
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const authed = !!getToken();

  if (!authed) {
    const next = location.pathname + location.search + location.hash;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return children;
};

// Обертка над LoginPage, чтобы редиректить туда, куда нужно
const LoginRoute = ({ onLogin }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const handleLogin = () => {
    onLogin?.();

    const next = params.get("next");
    // если next есть — идём туда, иначе на главную
    navigate(next ? decodeURIComponent(next) : "/", { replace: true });
  };

  return (
    <>
      <LoginPage onLogin={handleLogin} />
      <ToastContainer position="bottom-right" />
    </>
  );
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
    setIsLoading(false);

    // если токен поменялся в другой вкладке
    const onStorage = (e) => {
      if (e.key === "token") setAuthed(!!getToken());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setAuthed(false);
    // пусть роутер сам переведет на /login через ProtectedRoute
  };

  const handleLoginState = () => {
    setAuthed(true);
  };

  if (isLoading) return <div>Загрузка...</div>;

  return (
    <Router>
      <Routes>
        {/* Публичный логин */}
        <Route path="/login" element={<LoginRoute onLogin={handleLoginState} />} />

        {/* Всё остальное — защищено */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div className="app-container">
                {/* САЙДБАР */}
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

                {/* ПРАВАЯ ЧАСТЬ */}
                <main className="content-area">
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/sverka" element={<SverkaPage />} />
                    <Route path="/splits" element={<SplitsPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/departments" element={<DepartmentsPage />} />
                    <Route path="/instruments" element={<InstrumentsPage />} />
                    <Route path="/crypto" element={<AccountsPage />} />

                    <Route path="/profile" element={<ProfilePage onLogout={handleLogout} />} />
                    <Route path="/settings" element={<SettingsPage />} />

                    {/* если ввели неизвестный путь */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>

                <ToastContainer position="bottom-right" theme="light" />
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
