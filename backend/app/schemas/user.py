from pydantic import BaseModel, ConfigDict


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    zitadel_sub: str
    email: str
    display_name: str | None = None
    role: str | None = None
    scope_type: str | None = None
    reseller_id: str | None = None
    company_id: str | None = None
    is_active: bool


class UserRoleAssign(BaseModel):
    role: str
    scope_type: str | None = None
    reseller_id: str | None = None
    company_id: str | None = None


class UserAssignSystems(BaseModel):
    system_ids: list[str]


class MeRead(UserRead):
    permissions: dict
