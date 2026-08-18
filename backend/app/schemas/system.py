from pydantic import BaseModel, ConfigDict


class SystemBase(BaseModel):
    name: str
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    company_id: str
    site_id: str | None = None
    status: str = "normal"


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
