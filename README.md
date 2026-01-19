
NeoExcelSync is an internal web platform for:
- **Reconciliation** of two Excel/CSV reports (upload → compare → results)
- **Split checking** (find stock splits based on a reference list)
- **Client folders** (store client files on server)
- **Task management** by department (tasks, comments, attachments)

Stack:
- **Backend:** Python **FastAPI** + PostgreSQL
- **Frontend:** React SPA served by **Nginx**, which also proxies API calls to the backend
- **Deployment:** Docker Compose

---

## Architecture

```
[Browser]
   |
   |  HTTP :80
   v
[frontend (nginx)]  -- /api/* -->  [backend (fastapi :8000)]  -->  [postgres]
   |
   └-- serves SPA static files
```

Frontend Nginx proxy (configured in `frontend/nginx.conf`):
- `/` → static SPA
- `/api/` → `http://backend:8000`

---

## Backend: how it works

Entry point: `backend/main.py`

Key responsibilities:
- **JWT auth** via `/api/token` (OAuth2 password flow) + `Authorization: Bearer <token>`
- **File upload** endpoints that store temp files in `temp_uploads/` (with basename + UUID protection)
- **Reconciliation pipeline**: reads 2 files → `processor.process_files()` → caches results in memory → allows export by `comparison_id`
- **Split checks**: upload daily file → `split_processor.find_splits()`
- **Settings** persistence via `settings_manager` (JSON file)
- **DB layer** via `database_manager.py` (psycopg2 + per-request connections)

Important runtime behavior:
- On startup: `database_manager.init_database()` creates tables with `CREATE TABLE IF NOT EXISTS` and applies a few `ALTER TABLE ... IF NOT EXISTS`.
- Reconciliation results are stored in an **in-memory cache** (`COMPARISON_CACHE`). After restart, cache is lost.

---

## Quick start (Docker)

### 1) Start

```bash
docker compose up -d
```

### 2) Open

- App: `http://<server-ip>/`
- Health: `http://<server-ip>/api/health`

---

## API overview (high level)

Auth:
- `POST /api/token` — login (form fields: `username`, `password`) → JWT
- `GET /api/profile` — profile + stats (JWT)

Reconciliation:
- `POST /api/compare` — upload 2 files + settings JSON (multipart)
- `GET /api/export/{comparison_id}` — export cached results to Excel

Splits:
- `POST /api/check-splits` — upload daily file + settings JSON

Clients:
- `/api/clients*` — client CRUD + file upload/download

Tasks:
- `/api/tasks*` — tasks, statuses, comments, attachments

Admin:
- `/api/admin/*` — users + departments (admin-only)

---
## CI/CD

There is a GitHub Actions workflow (`.github/workflows/docker-publish.yml`) that builds and pushes Docker images to Docker Hub.
Recommended improvements:
- Tag images by Git SHA (immutable) + also push `:latest`
- Update `docker-compose.yml` to use the desired tag
- Deploy with:
  ```bash
  docker compose pull
  docker compose up -d
  ```

---

## Repo hygiene

Recommended to remove from git / deployments:
- `backend/venv/`, `__pycache__/`, `.mypy_cache/`, `.ruff_cache/`, `.pytest_cache/`
- `frontend/node_modules/`
- SQL dumps (`dump.sql`, `backup.sql`) unless needed

---
