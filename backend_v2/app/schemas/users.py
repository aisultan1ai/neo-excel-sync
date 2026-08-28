from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str
    department: str
    is_admin: bool = False