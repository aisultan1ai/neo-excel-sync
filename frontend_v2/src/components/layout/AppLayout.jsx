import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileDiff,
  Layers,
  FileSpreadsheet,
  Users,
  Binary,
  Wallet,
  AlertTriangle,
  User,
  Settings,
} from "lucide-react";
import Sidebar from "./Sidebar";

const pageMeta = {
  "/": { title: "Главная", icon: LayoutDashboard, subtitle: "Обзор платформы и быстрые действия" },
  "/compare": { title: "Сверка", icon: FileDiff, subtitle: "Сверка данных Unity и АИС" },
  "/splits": { title: "Сплиты", icon: Layers, subtitle: "Проверка сплитов и справочников" },
  "/reports": { title: "Отчеты", icon: FileSpreadsheet, subtitle: "Клиентские отчеты и файлы" },
  "/departments": { title: "Департаменты", icon: Users, subtitle: "Задачи, комментарии и вложения" },
  "/instruments": { title: "Инструменты", icon: Binary, subtitle: "Сверка справочников инструментов" },
  "/unity-exchange": { title: "Unity ↔ Биржа", icon: FileDiff, subtitle: "Сверка биржевых сделок" },
  "/crypto": { title: "Крипто", icon: Wallet, subtitle: "Счета, потоки и операции" },
  "/problems": { title: "Проблемы", icon: AlertTriangle, subtitle: "Реестр системных и операционных проблем" },
  "/profile": { title: "Профиль", icon: User, subtitle: "Личный кабинет и безопасность" },
  "/settings": { title: "Настройки", icon: Settings, subtitle: "Параметры платформы" },
};

export default function AppLayout() {
  const location = useLocation();
  const meta = pageMeta[location.pathname] || {
    title: "NeoExcelSync",
    icon: LayoutDashboard,
    subtitle: "Рабочее пространство платформы",
  };
  const Icon = meta.icon;

  return (
    <div className="app-shell app-shell--new">
      <Sidebar />

      <div className="app-shell__right">
        <header className="app-topbar">
          <div className="app-topbar__main">
            <div className="app-topbar__icon">
              <Icon size={20} />
            </div>
            <div>
              <h1 className="app-topbar__title">{meta.title}</h1>
              <p className="app-topbar__subtitle">{meta.subtitle}</p>
            </div>
          </div>
        </header>

        <main className="app-shell__content app-shell__content--new">
          <Outlet />
        </main>
      </div>
    </div>
  );
}