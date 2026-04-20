from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user_record, get_current_user
from app.core.security import verify_password, get_password_hash
from app.repositories.users import get_user_by_username, update_user_password
from app.repositories.dashboard import get_user_stats
from app.schemas.profile import PasswordChange

router = APIRouter(prefix="/api/v2/profile", tags=["profile"])


@router.get("")
def get_profile(current_user=Depends(get_current_user_record)):
    stats = get_user_stats(current_user["id"])
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "department": current_user["department"],
        "is_admin": current_user["is_admin"],
        "stats": stats,
    }


@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    current_username: str = Depends(get_current_user),
):
    user = get_user_by_username(current_username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.old_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Old password incorrect")

    ok = update_user_password(user["id"], get_password_hash(payload.new_password))
    if not ok:
        raise HTTPException(status_code=500, detail="Error updating password")

    return {"status": "success"}