from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str