"""Auth request/response schemas. Validation happens here, at the boundary."""

import re
import uuid
from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.security import MAX_PASSWORD_BYTES

HVHH_REGEX = re.compile(r"^[0-9]{8}$")  # ASCII digits only: \d would accept Arabic-Indic digits
PHONE_REGEX = re.compile(r"^\+?[0-9 ()-]{6,20}$")
MIN_PASSWORD_LENGTH = 10


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = " ".join(value.split())
    return stripped or None


class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    account_type: Literal["individual", "company"] = "individual"
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_BYTES)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    company_name: str | None = Field(default=None, max_length=150)
    tax_id: str | None = Field(default=None, max_length=8)
    contact_person: str | None = Field(default=None, max_length=100)

    @field_validator("password")
    @classmethod
    def _password_fits_bcrypt(cls, value: str) -> str:
        if len(value.encode()) > MAX_PASSWORD_BYTES:
            raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
        if not (any(c.isalpha() for c in value) and any(c.isdigit() for c in value)):
            raise ValueError("Password must contain letters and digits")
        return value

    @field_validator("first_name", "last_name", "company_name", "contact_person")
    @classmethod
    def _normalize_text(cls, value: str | None) -> str | None:
        return _clean(value)

    @field_validator("phone")
    @classmethod
    def _valid_phone(cls, value: str | None) -> str | None:
        if value is not None and value != "" and not PHONE_REGEX.match(value):
            raise ValueError("Invalid phone number")
        return value or None

    @field_validator("tax_id")
    @classmethod
    def _valid_hvhh(cls, value: str | None) -> str | None:
        if value is not None and value != "" and not HVHH_REGEX.match(value):
            raise ValueError("ՀՎՀՀ (tax ID) must be exactly 8 digits")
        return value or None

    @model_validator(mode="after")
    def _required_fields_for_account_type(self) -> Self:
        if self.account_type == "company":
            missing = [f for f in ("company_name", "tax_id", "contact_person") if not getattr(self, f)]
            if missing:
                raise ValueError(f"Required for company accounts: {', '.join(missing)}")
        else:
            if not self.first_name or not self.last_name:
                raise ValueError("first_name and last_name are required")
            if self.company_name or self.tax_id:
                raise ValueError("Company fields are only allowed for company accounts")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_BYTES)

    @field_validator("password")
    @classmethod
    def _password_fits_bcrypt(cls, value: str) -> str:
        # Rejected here, for every email alike, so bcrypt's 72-byte limit cannot
        # create a fast path that reveals which accounts exist.
        if len(value.encode("utf-8", errors="replace")) > MAX_PASSWORD_BYTES:
            raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
        return value


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    account_type: Literal["individual", "company"]
    role: str
    first_name: str | None
    last_name: str | None
    phone: str | None
    company_name: str | None
    tax_id: str | None
    contact_person: str | None
    is_verified: bool
    is_b2b: bool = Field(description="Approved company account: wholesale prices and invoicing")
    created_at: datetime
