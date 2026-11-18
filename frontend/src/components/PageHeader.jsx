import React from "react";
import DotField from "./DotField";

/**
 * Шапка раздела: светлая бирюзово-серая карточка с полем точек.
 * Слева — значок, заголовок и подзаголовок, справа — кнопки или плашки страницы (как есть).
 */
export default function PageHeader({ title, subtitle, icon: Icon, actions, style }) {
  return (
    <section className="page-header" style={style}>
      <DotField variant="mid" spacing={8} focusX={0.78} focusY={0.25} />
      <div className="page-header__shade" aria-hidden="true" />
      <div className="page-header__body">
        <div className="page-header__text">
          <h1 className="page-header__title">
            {Icon && <Icon size={30} strokeWidth={1.6} color="#BFEDE5" aria-hidden="true" />}
            {title}
          </h1>
          {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </section>
  );
}
