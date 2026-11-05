"""
User ORM Model (`users` table).
Supports both B2C individual shoppers and B2B contractors/trade companies.
"""

from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, CheckConstraint, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.order import Order


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "account_type IN ('individual', 'company')",
            name="chk_users_account_type",
        ),
        CheckConstraint(
            "account_type = 'individual' OR (company_name IS NOT NULL AND tax_id IS NOT NULL)",
            name="chk_company_fields",
        ),
    )

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # B2C vs B2B role & classification
    account_type: Mapped[str] = mapped_column(String(20), default="individual", nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="customer", nullable=False)

    # Individual profile fields
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # B2B company & trade fields
    company_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    tax_id: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    company_registration_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trade_discount_tier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)

    # Security flags
    token_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    orders: Mapped[List["Order"]] = relationship(
        "Order",
        back_populates="user",
        cascade="all, delete-orphan",
    )

