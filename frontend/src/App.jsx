// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { FileDiff, Settings, FileSpreadsheet, Layers } from 'lucide-react';
// --- НОВЫЕ ИМПОРТЫ ---
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
// ---------------------
import './App.css';

import SverkaPage from './pages/SverkaPage';
import SplitsPage from './pages/SplitsPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';

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
  return (
    <Router>
      <div className="app-container">
        {/* ЛЕВОЕ МЕНЮ */}
        <aside className="sidebar">
          <div className="logo-area">
            <h2>NeoExcelSync</h2>
          </div>

          <nav className="nav-menu">
            <NavButton to="/" icon={FileDiff} label="Сверка" />
            <NavButton to="/splits" icon={Layers} label="Сплиты" />
            <NavButton to="/reports" icon={FileSpreadsheet} label="Отчеты" />

            <div className="spacer" />

            <NavButton to="/settings" icon={Settings} label="Настройки" />
          </nav>
        </aside>

        {/* ПРАВАЯ ЧАСТЬ (КОНТЕНТ) */}
        <main className="content-area">
          <Routes>
            <Route path="/" element={<SverkaPage />} />
            <Route path="/splits" element={<SplitsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        {/* --- КОНТЕЙНЕР ДЛЯ УВЕДОМЛЕНИЙ (ВНИЗУ СПРАВА) --- */}
        <ToastContainer
            position="bottom-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
        />
      </div>
    </Router>
  );
}

export default App;