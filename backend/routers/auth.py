import bcrypt
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from core.database import get_db_connection
from core.deps import get_current_user
from core.limiter import limiter
from core.security import verify_password, create_access_token
from db.users import get_user_by_username, get_user_stats, update_user_password
from db.users import get_dashboard_stats

log = logging.getLogger(__name__)
router = APIRouter()


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


@router.post("/api/v1/token")
@limiter.limit("10/minute")
async def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_username(form_data.username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/api/v1/profile")
async def get_profile_info(current_user: str = Depends(get_current_user)):
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")
    stats = get_user_stats(user.id)
    return {
        "id": user.id,
        "username": current_user,
        "department": user.department,
        "is_admin": user.is_admin,
        "stats": stats,
    }


@router.post("/api/v1/profile/change-password")
async def change_password(
    data: PasswordChange, current_user: str = Depends(get_current_user)
):
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(400, "Old password incorrect")
    salt = bcrypt.gensalt()
    new_hash = bcrypt.hashpw(data.new_password.encode("utf-8"), salt).decode("utf-8")
    if update_user_password(user.id, new_hash):
        return {"status": "success"}
    raise HTTPException(500, "Error updating password")


@router.get("/api/v1/dashboard")
async def get_dashboard_data(current_user: str = Depends(get_current_user)):
    return get_dashboard_stats() or {"users": 0, "total_tasks": 0}


@router.get("/api/v1/health")
def health_check():
    db_status = "Disconnected"
    conn = None
    try:
        conn = get_db_connection()
        if conn is not None:
            db_status = "Connected"
    except Exception:
        log.debug("DB healthcheck failed", exc_info=True)
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                log.debug("Failed to close DB connection in healthcheck", exc_info=True)
    return {"api": "Online", "db": db_status}


@router.get("/")
def read_root():
    return {"status": "ok", "message": "NeoExcelSync Backend is running"}
