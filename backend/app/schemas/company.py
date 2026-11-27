import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
# Limits shared with the web forms: a person's full name, and the RFC 5321 email maximums.
CONTACT_NAME_MAX = 50
EMAIL_MAX = 254
EMAIL_LOCAL_MAX = 64


def validate_contact_phone(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    compact = re.sub(r"[\s()-]", "", value)
    if not re.fullmatch(r"\+?\d+", compact):
        raise ValueError("contact phone must contain a valid country code and number")
    digits = compact.removeprefix("+")
    if len(digits) < 6 or len(digits) > 15:
        raise ValueError("contact phone must contain 6 to 15 digits including the country code")
    return value.strip()


def validate_contact_name(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    cleaned = " ".join(value.split())
    if len(cleaned) < 2 or not any(character.isalpha() for character in cleaned):
        raise ValueError("contact name must contain a valid name")
    if len(cleaned) > CONTACT_NAME_MAX:
        raise ValueError(f"contact name must be at most {CONTACT_NAME_MAX} characters")
    if any(not (character.isalpha() or character in " .'-") for character in cleaned):
        raise ValueError("contact name may contain only letters, spaces, apostrophes, periods, or hyphens")
    return cleaned


def validate_contact_email(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    cleaned = value.strip()
    if not EMAIL_PATTERN.fullmatch(cleaned):
        raise ValueError("contact email must be a valid email address")
    if len(cleaned) > EMAIL_MAX or len(cleaned.split("@")[0]) > EMAIL_LOCAL_MAX:
        raise ValueError(f"contact email must be at most {EMAIL_MAX} characters, with at most {EMAIL_LOCAL_MAX} before the @")
    return cleaned


class CompanyBase(BaseModel):
    name: str
    address: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    lat: float | None = None
    lng: float | None = None
    reseller_id: str
    status: str = "active"
    notes: str | None = Field(default=None, max_length=5000)


class CompanyCreate(CompanyBase):
    _validate_phone = field_validator("contact_phone")(validate_contact_phone)
    _validate_contact_name = field_validator("contact_name")(validate_contact_name)
    _validate_contact_email = field_validator("contact_email")(validate_contact_email)


class CompanyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    notes: str | None = Field(default=None, max_length=5000)
    # customer_code (CUSTCODE) is intentionally absent: it is assigned once and is read-only.

    _validate_phone = field_validator("contact_phone")(validate_contact_phone)
    _validate_contact_name = field_validator("contact_name")(validate_contact_name)
    _validate_contact_email = field_validator("contact_email")(validate_contact_email)
    lat: float | None = None
    lng: float | None = None
    reseller_id: str | None = None
    status: str | None = None


class CompanyRead(CompanyBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    logo_data: str | None = None
    reseller_name: str | None = None
    customer_code: str | None = None
