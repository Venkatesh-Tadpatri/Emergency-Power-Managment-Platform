from pydantic import BaseModel, ConfigDict


class SiteBase(BaseModel):
    name: str
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    customer_id: str
    status: str = "active"


class SiteCreate(SiteBase):
    pass


class SiteUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: str | None = None


class SiteRead(SiteBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
