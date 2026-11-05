from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AlarmAcknowledge(BaseModel):
    comment: str | None = Field(default=None, max_length=1000)


class AlarmRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    system_id: str
    device_label: str | None = None
    severity: str
    message: str
    status: str
    occurred_at: datetime
    ack_by: str | None = None
    ack_at: datetime | None = None
    ack_comment: str | None = None
    cleared_at: datetime | None = None
