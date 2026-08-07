from pydantic import BaseModel, ConfigDict


class ATSBase(BaseModel):
    name: str
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    branch: str = "equipment"
    rated_amps: float | None = None
    rated_volts: float | None = None
    panel_id: str


class ATSCreate(ATSBase):
    pass


class ATSUpdate(BaseModel):
    name: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    branch: str | None = None
    rated_amps: float | None = None
    rated_volts: float | None = None
    panel_id: str | None = None


class ATSRead(ATSBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
