import logging
import os

import bcrypt
import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import CORS_ORIGINS
from db.migrations import init_all
from db import users as users_db
from excel_reconcile_single import register_excel_reconcile
from utils.scheduler import run_scheduled_cashouts

from routers import (
    auth,
    users,
    departments,
    clients,
    settings,
    sverka,
    splits,
    instruments,
    tasks,
    crypto,
    unity_exchange,
    funding_fee,
    cashout,
)

pd.set_option("future.no_silent_downcasting", True)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s", force=True
)
log = logging.getLogger(__name__)

app = FastAPI(title="NeoExcelSync API")

register_excel_reconcile(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(departments.router)
app.include_router(clients.router)
app.include_router(settings.router)
app.include_router(sverka.router)
app.include_router(splits.router)
app.include_router(instruments.router)
app.include_router(tasks.router)
app.include_router(crypto.router)
app.include_router(unity_exchange.router)
app.include_router(funding_fee.router)
app.include_router(cashout.router)

_scheduler = BackgroundScheduler(timezone="UTC")


@app.on_event("startup")
def startup_event():
    init_all()
    _scheduler.add_job(run_scheduled_cashouts, "cron", hour=9, minute=0, id="cashout_daily")
    _scheduler.start()
    log.info("Database initialized.")

    try:
        init_user = os.getenv("INIT_ADMIN_USERNAME")
        init_pass = os.getenv("INIT_ADMIN_PASSWORD")
        init_dept = os.getenv("INIT_ADMIN_DEPARTMENT", "Admin")
        init_is_admin = os.getenv("INIT_ADMIN_IS_ADMIN", "true").lower() in ("1", "true", "yes", "y")

        if init_user and init_pass:
            if users_db.count_users() == 0:
                salt = bcrypt.gensalt()
                hashed = bcrypt.hashpw(init_pass.encode("utf-8"), salt).decode("utf-8")
                users_db.create_new_user(init_user, hashed, init_dept, init_is_admin)
                log.info("Bootstrap admin created.")
    except Exception:
        log.exception("Bootstrap admin failed")
