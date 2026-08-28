import React from "react";

/**
 * Единый заголовок страницы.
 *
 * Props:
 *   title      — строка, обязательно
 *   subtitle   — строка (опционально)
 *   actions    — ReactNode: кнопки справа (опционально)
 *   badge      — ReactNode: бейдж рядом с заголовком (опционально)
 *
 * Пример:
 *   <PageHeader
 *     title="Проблемы"
 *     subtitle="Реестр операционных проблем"
 *     actions={<button className="save-btn">Добавить</button>}
 *   />
 */
export default function PageHeader({ title, subtitle, actions, badge }) {
  return (
    <div className="page-header">
      <div className="page-header__left">
        <div className="page-header__title-row">
          <h1 className="page-header__title">{title}</h1>
          {badge && <span className="page-header__badge">{badge}</span>}
        </div>
        {subtitle && (
          <p className="page-header__subtitle">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="page-header__actions">{actions}</div>
      )}
    </div>
  );
}