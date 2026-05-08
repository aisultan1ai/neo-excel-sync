from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from core.config import SECRET_KEY, ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return username


async def require_admin(current_user: str = Depends(get_current_user)) -> str:
    from db.users import get_user_by_username
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not (user[4] if len(user) > 4 else False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def ensure_task_owner_or_admin(task_row: dict, user_row: tuple):
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    is_admin = user_row[4] if len(user_row) > 4 else False
    if is_admin:
        return
    if task_row.get("from_user_id") != user_row[0]:
        raise HTTPException(status_code=403, detail="Not allowed")


def ff_get_user(current_user: str) -> tuple:
    from db.users import get_user_by_username
    user = get_user_by_username(current_user)
    if not user:
        raise HTTPException(404, "User not found")
    return user


def ff_check_account(account_id: int, user: tuple, require_owner: bool = False) -> dict:
    from db.funding import get_ff_account_by_id
    account = get_ff_account_by_id(account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    if require_owner:
        is_admin = user[4] if len(user) > 4 else False
        if not is_admin and account["owner_id"] != user[0]:
            raise HTTPException(403, "Forbidden: only account owner can perform this action")
    return account
