from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SystemBase(BaseModel):
    name: str
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    company_id: str
    site_id: str | None = None
    status: str = "normal"
    archived: bool = False


class SystemCreate(SystemBase):
    pass


class SystemUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    company_id: str | None = None
    site_id: str | None = None
    status: str | None = None


class SystemRead(SystemBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    site_name: str | None = None


class AlarmDisableRequest(BaseModel):
    duration: Literal["1h", "4h", "8h", "24h", "indefinite"]
    reason: str = Field(min_length=3, max_length=2000)


class AlarmDisableStatus(BaseModel):
    disabled: bool
    disabled_at: datetime | None = None
    disabled_until: datetime | None = None
    indefinite: bool = False
    reason: str | None = None
    disabled_by_name: str | None = None
    disabled_by_email: str | None = None
    can_control: bool = False


class SystemEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    event_type: str
    message: str
    occurred_at: datetime
    actor_name: str | None = None
    reason: str | None = None
