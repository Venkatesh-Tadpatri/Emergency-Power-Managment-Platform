import re

from pydantic import BaseModel, EmailStr, Field, field_validator


NAME_MAX = 15
PASSWORD_MIN = 10
PASSWORD_MAX = 30
# Letters A–Z with single spaces, hyphens or apostrophes between letters ("Mary-Ann", "O'Brien").
NAME_PATTERN = re.compile(r"[A-Za-z]+(?:[ '\-][A-Za-z]+)*")
# Country calling code followed by the national number, e.g. "+91 9876543210".
PHONE_PATTERN = re.compile(r"\+(\d{1,4}) (\d{4,14})")


def clean_person_name(value: str) -> str:
    value = " ".join(value.split())  # trim and collapse repeated spaces
    if not NAME_PATTERN.fullmatch(value):
        raise ValueError("name may contain only letters A–Z, spaces, hyphens (-) and apostrophes (')")
    if not 2 <= len(value) <= NAME_MAX:
        raise ValueError(f"name must be between 2 and {NAME_MAX} characters")
    return value


def clean_contact_number(value: str) -> str:
    value = value.strip()
    match = PHONE_PATTERN.fullmatch(value)
    if not match or len(match.group(1) + match.group(2)) > 15:
        raise ValueError("contact number must be a country code followed by the number, e.g. +91 9876543210")
    return value


def check_strong_password(value: str) -> str:
    if not (any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value) and any(not c.isalnum() for c in value)):
        raise ValueError("password must include uppercase, lowercase, number, and special character")
    return value


class RegisterRequest(BaseModel):
    # Lengths are re-checked after trimming in the validators below.
    first_name: str = Field(min_length=1, max_length=64)
    last_name: str = Field(min_length=1, max_length=64)
    email: EmailStr
    contact_number: str = Field(min_length=7, max_length=20)
    company_name: str | None = Field(default=None, max_length=255)  # optional
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)

    @field_validator("first_name", "last_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = " ".join(value.split())  # trim and collapse repeated spaces
        if not NAME_PATTERN.fullmatch(value):
            raise ValueError("name may contain only letters A–Z, spaces, hyphens (-) and apostrophes (')")
        if not 2 <= len(value) <= NAME_MAX:
            raise ValueError(f"name must be between 2 and {NAME_MAX} characters")
        return value

    @field_validator("contact_number")
    @classmethod
    def valid_contact_number(cls, value: str) -> str:
        value = value.strip()
        match = PHONE_PATTERN.fullmatch(value)
        if not match or len(match.group(1) + match.group(2)) > 15:
            raise ValueError("contact number must be a country code followed by the number, e.g. +91 9876543210")
        return value

    @field_validator("company_name", mode="before")
    @classmethod
    def clean_company_name(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("company name must be a string")
        value = value.strip()
        if not value:
            return None
        if len(value) < 2:
            raise ValueError("company name must be at least 2 characters")
        return value

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if not (any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value) and any(not c.isalnum() for c in value)):
            raise ValueError("password must include uppercase, lowercase, number, and special character")
        return value


class EmailRequest(BaseModel):
    email: EmailStr


class OtpVerifyRequest(EmailRequest):
    code: str = Field(pattern=r"^\d{6}$")


class LoginRequest(EmailRequest):
    password: str = Field(min_length=1, max_length=128)


class ResetPasswordRequest(OtpVerifyRequest):
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if not (any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value) and any(not c.isalnum() for c in value)):
            raise ValueError("password must include uppercase, lowercase, number, and special character")
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MessageResponse(BaseModel):
    message: str
    cooldown_seconds: int | None = None
    dev_otp: str | None = None


class FirstLoginVerifyResponse(BaseModel):
    """Proof that the OTP step passed; exchanged for the new password in the last step."""
    setup_token: str
    expires_in: int


class FirstLoginCompleteRequest(BaseModel):
    setup_token: str = Field(min_length=10, max_length=2048)
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return check_strong_password(value)
