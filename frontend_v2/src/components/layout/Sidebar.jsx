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
} from "lucide-react";

const items = [
  { to: "/", label: "Главная", icon: LayoutDashboard },
  { to: "/compare", label: "Сверка", icon: FileDiff },
  { to: "/splits", label: "Сплиты", icon: Layers },
  { to: "/departments", label: "Департаменты", icon: Users },
  { to: "/instruments", label: "Инструменты", icon: Binary },
  { to: "/unity-exchange", label: "Unity ↔ Биржа", icon: FileDiff },
  { to: "/crypto", label: "Крипто", icon: Wallet },
  { to: "/problems", label: "Проблемы", icon: AlertTriangle },
  { to: "/profile", label: "Профиль", icon: User },
  { to: "/settings", label: "Настройки", icon: Settings },
];

function isActive(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">NeoExcelSync V2</div>

      <nav className="sidebar__nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(location.pathname, item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`sidebar__link ${active ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}