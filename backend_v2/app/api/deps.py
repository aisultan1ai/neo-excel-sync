from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import settings
from app.repositories.users import get_user_public_by_username

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v2/auth/token")


def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
        return username
    except JWTError:
        raise credentials_exception


def get_current_user_record(username: str = Depends(get_current_user)):
    user = get_user_public_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def require_admin(user=Depends(get_current_user_record)):
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user