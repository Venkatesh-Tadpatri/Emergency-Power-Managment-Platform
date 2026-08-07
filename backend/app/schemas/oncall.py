from datetime import date

from pydantic import BaseModel, ConfigDict


class OnCallShiftBase(BaseModel):
    company_id: str
    shift_date: date
    day_label: str
    primary_name: str
    secondary_name: str | None = None
    shift_label: str = "24h"


class OnCallShiftCreate(OnCallShiftBase):
    pass


class OnCallShiftUpdate(BaseModel):
    shift_date: date | None = None
    day_label: str | None = None
    primary_name: str | None = None
    secondary_name: str | None = None
    shift_label: str | None = None


class OnCallShiftRead(OnCallShiftBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
