# NeoExcelSync

Внутренняя web-платформа для финансовых/операционных команд: сверка отчетов, проверка сплитов, хранение файлов клиентов и управление задачами по отделам.

## Возможности

- **Reconciliation (сверка)**: загрузка 2 Excel/CSV → сравнение → результаты → **экспорт в Excel**
- **Split checking**: поиск **stock splits** по референс-листу/настройкам
- **Client folders**: хранение файлов клиентов на сервере (загрузка/скачивание)
- **Task management**: задачи по департаментам, **комментарии**, **вложения**, статусы
- **JWT авторизация** (OAuth2 password flow)

---

## Стек

- **Backend:** Python **FastAPI**
- **DB:** **PostgreSQL**
- **Frontend:** **React SPA**
- **Reverse proxy / Static:** **Nginx** (отдает SPA и проксирует `/api/*` на backend)
- **Deploy:** **Docker Compose**
