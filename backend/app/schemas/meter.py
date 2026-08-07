from pydantic import BaseModel, ConfigDict


class MeterBase(BaseModel):
    ats_id: str
    make: str | None = None
    model: str | None = None


class MeterCreate(MeterBase):
    pass


class MeterUpdate(BaseModel):
    make: str | None = None
    model: str | None = None


class MeterRead(MeterBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
