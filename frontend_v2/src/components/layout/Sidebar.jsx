import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileDiff,
  Layers,
  Settings,
  User,
  Users,
  Binary,
  Wallet,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";

const groups = [
  {
    title: "Операции",
    items: [
      { to: "/", label: "Главная", icon: LayoutDashboard },
      { to: "/compare", label: "Сверка", icon: FileDiff },
      { to: "/splits", label: "Сплиты", icon: Layers },
      { to: "/unity-exchange", label: "Unity ↔ Биржа", icon: FileDiff },
      { to: "/crypto", label: "Крипто", icon: Wallet },
      { to: "/reports", label: "Отчеты", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Справочники",
    items: [
      { to: "/departments", label: "Департаменты", icon: Users },
      { to: "/instruments", label: "Инструменты", icon: Binary },
      { to: "/problems", label: "Проблемы", icon: AlertTriangle },
    ],
  },
  {
    title: "Профиль",
    items: [
      { to: "/profile", label: "Профиль", icon: User },
      { to: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

function isActive(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="sidebar sidebar--new">
      <div className="sidebar__brand">
        <div className="sidebar__brand-mark">N</div>
        <div>
          <div className="sidebar__logo">NeoExcelSync</div>
          <div className="sidebar__version">V2 Workspace</div>
        </div>
      </div>

      <div className="sidebar__groups">
        {groups.map((group) => (
          <div key={group.title} className="sidebar__group">
            <div className="sidebar__group-title">{group.title}</div>

            <nav className="sidebar__nav">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(location.pathname, item.to);

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`sidebar__link ${active ? "active" : ""}`}
                  >
                    <span className="sidebar__link-icon">
                      <Icon size={18} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}