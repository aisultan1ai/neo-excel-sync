from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_admin
from app.core.security import get_password_hash
from app.repositories.users import list_users, create_user
from app.schemas.users import UserCreate

router = APIRouter(prefix="/api/v2/admin/users", tags=["admin-users"])


@router.get("")
def get_users(admin_user=Depends(require_admin)):
    return list_users()


@router.post("")
def admin_create_user(payload: UserCreate, admin_user=Depends(require_admin)):
    try:
        row = create_user(
            username=payload.username.strip(),
            password_hash=get_password_hash(payload.password),
            department=payload.department.strip(),
            is_admin=payload.is_admin,
        )
        return {"status": "success", "user": row}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))