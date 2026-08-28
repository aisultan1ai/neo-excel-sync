import os
from fastapi.middleware.cors import CORSMiddleware

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
from app.api.routers.unity_exchange import router as unity_exchange_router
from app.api.routers.podft import router as podft_router
from app.api.routers.crypto import router as crypto_router
from app.api.routers.dashboard import router as dashboard_router
from app.api.routers.problems import router as problems_router
from app.api.routers.users import router as users_router
from app.api.routers.compare_instruments import router as compare_instruments_router
app = FastAPI(title=settings.APP_NAME)

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:4173,http://127.0.0.1:4173,http://172.16.181.20:4173,http://localhost:8080",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(unity_exchange_router)
app.include_router(podft_router)
app.include_router(crypto_router)
app.include_router(dashboard_router)
app.include_router(problems_router)
app.include_router(users_router)
app.include_router(compare_instruments_router)