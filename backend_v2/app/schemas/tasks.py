from datetime import date
from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    to_department: str
    to_user_id: int | None = None
    priority: str = "normal"
    due_date: date | None = None


class TaskStatusUpdate(BaseModel):
    status: str