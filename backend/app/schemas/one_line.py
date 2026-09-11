from typing import Any

from pydantic import BaseModel, ConfigDict


class OneLineUpsert(BaseModel):
    data: dict[str, Any]


class OneLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    system_id: str
    data: dict[str, Any]
