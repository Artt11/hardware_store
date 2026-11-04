from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from uuid import UUID
from datetime import datetime

class RegisterRequest(BaseModel):
    account_type: Literal["individual", "company"] = "individual"
    email: str = Field(..., pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", description="Valid email address")
    password: str = Field(..., min_length=8, max_length=128, description="Minimum 8 characters with numbers and symbols")
    
    # B2C Individual fields
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    
    # B2B Company fields
    company_name: Optional[str] = Field(None, max_length=150)
    tax_id: Optional[str] = Field(None, max_length=50, description="Tax ID / VAT number for business invoicing")
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=30)

    @model_validator(mode="after")
    def validate_b2b_or_b2c_fields(self):
        # Strict validation ensuring B2B companies provide legal business identity
        if self.account_type == "company":
            if not self.company_name or not self.company_name.strip():
                raise ValueError("Company Name is required for Company (B2B) registration.")
            if not self.tax_id or not self.tax_id.strip():
                raise ValueError("Tax ID / VAT Number is required for Company (B2B) registration.")
            if not self.contact_person or not self.contact_person.strip():
                raise ValueError("Authorized Contact Person is required for Company (B2B) registration.")
        else:
            if not self.first_name or not self.first_name.strip():
                raise ValueError("First Name is required for Individual registration.")
            if not self.last_name or not self.last_name.strip():
                raise ValueError("Last Name is required for Individual registration.")
        return self

class LoginRequest(BaseModel):
    email: str = Field(..., pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900 # 15 minutes in seconds

class UserProfileResponse(BaseModel):
    id: UUID
    email: str
    account_type: Literal["individual", "company"]
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
