from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
