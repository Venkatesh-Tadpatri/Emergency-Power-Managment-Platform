from pydantic import BaseModel, ConfigDict


class CompanyBase(BaseModel):
    name: str
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    reseller_id: str
    status: str = "active"


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    reseller_id: str | None = None
    status: str | None = None


class CompanyRead(CompanyBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
