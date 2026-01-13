import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { FileDiff, Settings, FileSpreadsheet, Layers, Users, User, LayoutDashboard, Binary, Wallet } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

import DashboardPage from './pages/DashboardPage';
import SverkaPage from './pages/SverkaPage';
import SplitsPage from './pages/SplitsPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import LoginPage from './pages/LoginPage';
import DepartmentsPage  from "./pages/DepartmentsPage.jsx";
import ProfilePage from './pages/ProfilePage';
import InstrumentsPage from './pages/InstrumentsPage';

import AccountsPage from "./pages/AccountsPage";


const NavButton = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link to={to} className={`nav-btn ${isActive ? 'active' : ''}`}>
      <Icon size={20} style={{ marginRight: '10px' }} />
      {label}
    </Link>
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- ЛОГИКА АВТОРИЗАЦИИ ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) setIsAuthenticated(true);
    setIsLoading(false);
  }, []);

  // const handleLogin = () => setIsAuthenticated(true);

    const handleLogin = () => {
    // ЭТА СТРОКА СБРАСЫВАЕТ АДРЕС НА ГЛАВНУЮ СТРАНИЦУ
    window.history.replaceState(null, '', '/');

    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  if (isLoading) return <div>Загрузка...</div>;

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <ToastContainer position="bottom-right" />
      </>
    );
  }

  return (
    <Router>
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

            {/* Распорка (всё, что ниже неё, прижмется к низу экрана) */}
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
          </Routes>
        </main>

        <ToastContainer position="bottom-right" theme="light" />
      </div>
    </Router>
  );
}

export default App;