import bcrypt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.deps import get_current_user, require_admin
from db.users import get_users_basic, get_all_users, create_new_user, delete_user, get_user_by_username

router = APIRouter()


class UserCreate(BaseModel):
    username: str
    password: str
    department: str
    is_admin: bool = False


@router.get("/api/users")
async def list_users(current_user: str = Depends(get_current_user)):
    return get_users_basic()


@router.get("/api/admin/users")
async def get_users_list(current_user: str = Depends(require_admin)):
    return get_all_users()


@router.post("/api/admin/users")
async def admin_create_user(
    user: UserCreate, current_user: str = Depends(require_admin)
):
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(user.password.encode("utf-8"), salt).decode("utf-8")
    if create_new_user(user.username, hashed, user.department, user.is_admin):
        return {"status": "success"}
    raise HTTPException(400, "User exists or error")


@router.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, current_user: str = Depends(require_admin)):
    caller = get_user_by_username(current_user)
    if caller and caller.id == user_id:
        raise HTTPException(400, "Cannot delete yourself")
    if delete_user(user_id):
        return {"status": "success"}
    raise HTTPException(500, "Error deleting user")
