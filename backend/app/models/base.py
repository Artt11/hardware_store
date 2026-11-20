"""Declarative base, naming convention and shared column helpers."""

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import DateTime, MetaData, Numeric, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Deterministic constraint names so Alembic autogenerate and downgrades are stable.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

Money = Numeric(12, 2)
# [0-9], not \d: \d also matches non-ASCII digits in some locales.
HVHH_SQL_PATTERN = "^[0-9]{8}$"


def sql_in(column: str, values: Iterable[str]) -> str:
    """Render `column IN ('a', 'b')` for CHECK constraints from trusted constants."""
    items = list(values)
    if not items or any("'" in v for v in items):
        raise ValueError(f"invalid CHECK values for {column}: {items!r}")
    return f"{column} IN ({', '.join(repr(v) for v in items)})"


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    # Fetch server-generated values (e.g. updated_at) via RETURNING after INSERT and UPDATE,
    # so reading them never triggers a hidden lazy load under asyncio.
    __mapper_args__ = {"eager_defaults": True}


class UUIDPrimaryKey:
    # Python default so the id is known before flush; server default for raw SQL inserts.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
