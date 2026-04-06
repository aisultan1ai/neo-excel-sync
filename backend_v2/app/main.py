from fastapi import FastAPI

from app.core.config import settings
from app.db.init_db import init_database

from app.api.routers.health import router as health_router
from app.api.routers.auth import router as auth_router
from app.api.routers.profile import router as profile_router
from app.api.routers.departments import router as departments_router
from app.api.routers.admin_users import router as admin_users_router
from app.api.routers.tasks import router as tasks_router
from app.api.routers.task_comments import router as task_comments_router
from app.api.routers.task_attachments import router as task_attachments_router
from app.api.routers.clients import router as clients_router
from app.api.routers.settings import router as settings_router
from app.api.routers.splits import router as splits_router
from app.api.routers.compare import router as compare_router

app = FastAPI(title=settings.APP_NAME)


@app.on_event("startup")
def on_startup():
    init_database()


@app.get("/")
def root():
    return {"status": "ok", "message": "NeoExcelSync V2 is running"}


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(departments_router)
app.include_router(admin_users_router)
app.include_router(tasks_router)
app.include_router(task_comments_router)
app.include_router(task_attachments_router)
app.include_router(clients_router)
app.include_router(settings_router)
app.include_router(splits_router)
app.include_router(compare_router)