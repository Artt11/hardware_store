"""Shared FastAPI dependencies, declared with `Annotated` as the FastAPI docs recommend
(https://fastapi.tiangolo.com/tutorial/dependencies/#share-annotated-dependencies).

Authentication reads the HttpOnly access cookie and validates it against PostgreSQL
on every request (user exists, is active, token_version matches), so logout and
deactivation take effect immediately (audit R1).
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_session
from app.models.user import User
from app.services.auth import InvalidSession, user_from_token

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

UNAUTHORIZED = HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required.")


def single_cookie(request: Request, name: str) -> str | None:
    """Cookie value, or None if the name appears more than once. Duplicates mean a
    cookie was planted from another (sub)domain alongside ours: trust neither."""
    raw = request.headers.get("cookie", "")
    occurrences = sum(1 for part in raw.split(";") if part.strip().split("=", 1)[0] == name)
    return request.cookies.get(name) if occurrences == 1 else None


async def get_current_user(request: Request, db: DbSession) -> User:
    try:
        return await user_from_token(db, single_cookie(request, settings.ACCESS_COOKIE_NAME), kind="access")
    except InvalidSession:
        raise UNAUTHORIZED from None


async def get_optional_user(request: Request, db: DbSession) -> User | None:
    """None for guests. A present-but-invalid cookie is a 401 (the client should refresh),
    never a silent downgrade to guest pricing."""
    if settings.ACCESS_COOKIE_NAME not in request.cookies:
        return None
    return await get_current_user(request, db)


async def get_current_user_id(user: Annotated[User, Depends(get_current_user)]) -> UUID:
    return user.id


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]
