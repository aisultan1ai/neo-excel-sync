import re
from typing import Optional

from fastapi import Depends, HTTPException, Request, status

_JWT_RE = re.compile(r'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from core.config import SECRET_KEY, ALGORITHM

# auto_error=False: don't raise 401 if header is missing — we'll check cookie as fallback
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/token", auto_error=False)


async def get_current_user(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
) -> str:
    valid_bearer = bearer_token if (bearer_token and _JWT_RE.match(bearer_token)) else None
    token = valid_bearer or request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return username


async def require_admin(current_user: str = Depends(get_current_user)) -> str:
    from db.users import get_user_by_username
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_settings_admin(current_user: str = Depends(get_current_user)) -> str:
    from db.users import get_user_by_username
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def ensure_task_owner_or_admin(task_row: dict, user_row):
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    if user_row.is_admin:
        return
    if task_row.get("from_user_id") != user_row.id:
        raise HTTPException(status_code=403, detail="Not allowed")


def ff_get_user(current_user: str):
    from db.users import get_user_by_username
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")
    if not user.is_admin and user.department != "Trading":
        raise HTTPException(403, "Доступ разрешён только департаменту Trading")
    return user


def ff_check_account(account_id: int, user, require_owner: bool = False) -> dict:
    from db.funding import get_ff_account_by_id
    account = get_ff_account_by_id(account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    if require_owner:
        if not user.is_admin and account["owner_id"] != user.id:
            raise HTTPException(403, "Forbidden: only account owner can perform this action")
    return account
