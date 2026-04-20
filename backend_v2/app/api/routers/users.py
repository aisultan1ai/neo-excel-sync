from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_record
from app.repositories.users import get_users_basic

router = APIRouter(prefix="/api/v2/users", tags=["users"])


@router.get("")
def list_basic_users(current_user=Depends(get_current_user_record)):
    return get_users_basic()