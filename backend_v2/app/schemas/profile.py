from pydantic import BaseModel


class PasswordChange(BaseModel):
    old_password: str
    new_password: str