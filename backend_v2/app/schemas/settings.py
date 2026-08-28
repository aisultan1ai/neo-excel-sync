from pydantic import BaseModel
from typing import Any


class SettingsPayload(BaseModel):
    data: dict[str, Any]