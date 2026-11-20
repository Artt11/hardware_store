"""Refresh sessions: one row per signed-in device/browser.

Each row is a refresh-token family. Rotation moves `current_jti` to `previous_jti`;
presenting `previous_jti` within REFRESH_REUSE_GRACE_SECONDS is a benign race
(two tabs refreshing at once) and returns the already-rotated session. Any other
stale jti is treated as theft and deletes only this row, so other devices stay
signed in. Access tokens carry the session id too, so deleting the row (logout,
theft) revokes them immediately.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPrimaryKey


class UserSession(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    current_jti: Mapped[str] = mapped_column(String(32), nullable=False)
    previous_jti: Mapped[str | None] = mapped_column(String(32))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
