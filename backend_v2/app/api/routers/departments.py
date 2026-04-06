from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.repositories.departments import list_departments

router = APIRouter(prefix="/api/v2/departments", tags=["departments"])


@router.get("")
def get_departments(current_user: str = Depends(get_current_user)):
    return list_departments()