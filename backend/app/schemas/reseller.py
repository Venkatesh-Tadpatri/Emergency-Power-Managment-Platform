from pydantic import BaseModel, ConfigDict


class ResellerBase(BaseModel):
    name: str
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str = "active"
    show_logo_on_reports: bool = False


class ResellerCreate(ResellerBase):
    pass


class ResellerUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str | None = None
    show_logo_on_reports: bool | None = None


class ResellerRead(ResellerBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    logo_data: str | None = None
