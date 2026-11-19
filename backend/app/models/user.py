"""Users: B2C individuals and B2B companies.

`account_type` alone decides B2B status (wholesale pricing, invoicing, credit).
`role` only distinguishes staff (admin) from customers.
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, text
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import HVHH_SQL_PATTERN, Base, Money, Timestamps, UUIDPrimaryKey, sql_in

if TYPE_CHECKING:
    from app.models.order import Order

ACCOUNT_TYPES = ("individual", "company")
ROLES = ("customer", "admin")


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(sql_in("account_type", ACCOUNT_TYPES), name="account_type_valid"),
        CheckConstraint(sql_in("role", ROLES), name="role_valid"),
        CheckConstraint(f"tax_id IS NULL OR tax_id ~ '{HVHH_SQL_PATTERN}'", name="tax_id_hvhh"),
        CheckConstraint(
            "account_type = 'individual' OR ("
            "btrim(coalesce(company_name, '')) <> '' AND tax_id IS NOT NULL "
            "AND btrim(coalesce(contact_person, '')) <> '')",
            name="company_fields_required",
        ),
        CheckConstraint(
            "account_type = 'company' OR (credit_limit = 0 AND payment_terms_days = 0)",
            name="credit_only_for_companies",
        ),
        CheckConstraint("credit_limit >= 0", name="credit_limit_non_negative"),
        CheckConstraint("payment_terms_days >= 0", name="payment_terms_non_negative"),
        CheckConstraint("token_version >= 1", name="token_version_positive"),
        CheckConstraint("failed_login_attempts >= 0", name="failed_logins_non_negative"),
    )

    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), server_default="individual", nullable=False)
    role: Mapped[str] = mapped_column(String(20), server_default="customer", nullable=False)

    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30))

    company_name: Mapped[str | None] = mapped_column(String(150))
    tax_id: Mapped[str | None] = mapped_column(String(8), index=True)
    contact_person: Mapped[str | None] = mapped_column(String(100))
    credit_limit: Mapped[Decimal] = mapped_column(Money, server_default="0", nullable=False)
    payment_terms_days: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    token_version: Mapped[int] = mapped_column(Integer, server_default="1", nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # Orders are financial records: deleting a user keeps them (FK SET NULL; orders
    # carry their own customer snapshot).
    orders: Mapped[list["Order"]] = relationship(back_populates="user", lazy="raise", passive_deletes=True)

    @property
    def is_b2b(self) -> bool:
        return self.account_type == "company"

    @property
    def display_name(self) -> str:
        if self.is_b2b and self.company_name:
            return self.company_name
        return " ".join(p for p in (self.first_name, self.last_name) if p) or self.email
