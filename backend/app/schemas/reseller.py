from pydantic import BaseModel, ConfigDict


class ResellerBase(BaseModel):
    name: str
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str = "active"


class ResellerCreate(ResellerBase):
    pass


class ResellerUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str | None = None


class ResellerRead(ResellerBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
