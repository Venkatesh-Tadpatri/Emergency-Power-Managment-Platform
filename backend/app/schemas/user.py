from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.auth import clean_contact_number, clean_person_name


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    zitadel_sub: str | None = None
    email: str
    display_name: str | None = None
    role: str | None = None
    scope_type: str | None = None
    reseller_id: str | None = None
    company_id: str | None = None
    is_active: bool
    account_state: str = "active"
    contact_number: str | None = None
    requested_company_name: str | None = None
    assigned_system_ids: list[str] = []
    assigned_site_ids: list[str] = []
    first_name: str | None = None
    last_name: str | None = None
    invited_at: datetime | None = None
    invited_by: str | None = None


class UserCreate(BaseModel):
    """An admin creates the account; the user activates it via First-time login."""
    first_name: str = Field(min_length=1, max_length=64)
    last_name: str = Field(min_length=1, max_length=64)
    email: EmailStr
    contact_number: str = Field(min_length=7, max_length=20)
    # Tenant the account belongs to. Company admins are always pinned to their own
    # customer; reseller admins to one of their customers or their reseller.
    reseller_id: str | None = None
    company_id: str | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return clean_person_name(value)

    @field_validator("contact_number")
    @classmethod
    def valid_contact_number(cls, value: str) -> str:
        return clean_contact_number(value)


class UserRoleAssign(BaseModel):
    role: str
    scope_type: str | None = None
    reseller_id: str | None = None
    company_id: str | None = None


class UserAssignSystems(BaseModel):
    system_ids: list[str]
    site_ids: list[str] = []


class UserStateUpdate(BaseModel):
    account_state: Literal["active", "suspended", "locked"]


class MeRead(UserRead):
    permissions: dict
