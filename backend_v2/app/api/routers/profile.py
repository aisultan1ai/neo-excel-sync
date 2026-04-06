from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_record

router = APIRouter(prefix="/api/v2/profile", tags=["profile"])


@router.get("")
def get_profile(current_user=Depends(get_current_user_record)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "department": current_user["department"],
        "is_admin": current_user["is_admin"],
    }