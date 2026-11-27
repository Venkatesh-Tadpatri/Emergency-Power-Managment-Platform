from pydantic import BaseModel, ConfigDict, field_validator

# Same contact rules as customers: phone is "+<country code> <number>", contact name is letters only.
from app.schemas.company import validate_contact_email, validate_contact_name, validate_contact_phone


def validate_company_name(value: str | None) -> str | None:
    """Organisation names may contain digits (e.g. "3M", "Unit 42") but must not be numbers only."""
    if value is None:
        return None
    cleaned = " ".join(value.split())
    if len(cleaned) < 2 or len(cleaned) > 120:
        raise ValueError("company name must be between 2 and 120 characters")
    if not any(character.isalpha() for character in cleaned):
        raise ValueError("company name must contain letters and cannot be numbers only")
    if any(not (character.isalnum() or character in " &.,'()/-") for character in cleaned):
        raise ValueError("company name may contain only letters, numbers, spaces and & . , ' ( ) / -")
    return cleaned


class ResellerBase(BaseModel):
    name: str
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str = "active"
    show_logo_on_reports: bool = False


class ResellerCreate(ResellerBase):
    _validate_name = field_validator("name")(validate_company_name)
    _validate_phone = field_validator("contact_phone")(validate_contact_phone)
    _validate_contact_name = field_validator("contact_name")(validate_contact_name)
    _validate_contact_email = field_validator("contact_email")(validate_contact_email)


class ResellerUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str | None = None
    show_logo_on_reports: bool | None = None

    _validate_name = field_validator("name")(validate_company_name)
    _validate_phone = field_validator("contact_phone")(validate_contact_phone)
    _validate_contact_name = field_validator("contact_name")(validate_contact_name)
    _validate_contact_email = field_validator("contact_email")(validate_contact_email)


class ResellerRead(ResellerBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    logo_data: str | None = None
