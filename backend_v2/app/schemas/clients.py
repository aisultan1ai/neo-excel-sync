from pydantic import BaseModel


class ClientCreate(BaseModel):
    name: str
    email: str = ""
    account_number: str = ""


class ClientUpdate(BaseModel):
    name: str
    email: str = ""
    account_number: str = ""
    status: str = "gray"