"""Authentication: registration, login with lockout, token issue/refresh, revocation.

Login (hardened after adversarial review):
1. Claim an attempt atomically BEFORE bcrypt: one UPDATE increments the failure
   counter only if the account is not locked, and sets the lock when the threshold
   is reached. Parallel guesses can therefore never exceed the threshold.
2. Commit, releasing the DB connection while bcrypt runs (~200 ms).
3. bcrypt always runs (dummy hash for unknown or locked accounts), and every
   failure returns the same 401: status, body and timing reveal nothing about
   which emails exist or are locked.
4. On success, reset the counter only if the account is still unlocked, so a
   correct parallel guess cannot erase a lock another request just set.

Sessions: tokens carry `token_version` (bumped on logout/revocation). The refresh
token's jti is stored on the user and rotated on each refresh; presenting an older
refresh token is treated as theft and revokes every session.
"""

import uuid
from datetime import timedelta

from sqlalchemy import ColumnElement, case, func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    TokenError,
    TokenKind,
    ahash_password,
    averify_password_or_dummy,
    create_token,
    decode_token,
    needs_rehash,
    new_jti,
)
from app.models.user import User
from app.schemas.auth import RegisterRequest


class EmailTaken(Exception):
    pass


class InvalidCredentials(Exception):
    """Wrong password, unknown email, locked or disabled account: deliberately one error."""


class InvalidSession(Exception):
    pass


def _not_locked() -> ColumnElement[bool]:
    return or_(User.locked_until.is_(None), User.locked_until <= func.now())


async def register(db: AsyncSession, data: RegisterRequest) -> User:
    user = User(
        email=str(data.email),
        password_hash=await ahash_password(data.password),
        account_type=data.account_type,
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        company_name=data.company_name,
        tax_id=data.tax_id,
        contact_person=data.contact_person,
        refresh_token_jti=new_jti(),
    )
    db.add(user)
    try:
        await db.commit()  # the unique constraint decides, so concurrent sign-ups cannot both win
    except IntegrityError as exc:
        await db.rollback()
        if "uq_users_email" in str(exc.orig):
            raise EmailTaken from None
        raise
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    threshold = settings.LOGIN_LOCKOUT_THRESHOLD
    new_count = User.failed_login_attempts + 1
    claimed = (
        await db.execute(
            update(User)
            .where(User.email == email, _not_locked())
            .values(
                failed_login_attempts=case((new_count >= threshold, 0), else_=new_count),
                locked_until=case(
                    (new_count >= threshold, func.now() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)),
                    else_=None,
                ),
            )
            .returning(User.id, User.password_hash, User.is_active)
        )
    ).first()
    await db.commit()  # persist the claim and release the connection before bcrypt

    password_ok = await averify_password_or_dummy(password, claimed.password_hash if claimed else None)
    if claimed is None or not password_ok or not claimed.is_active:
        raise InvalidCredentials

    values: dict[str, object] = {
        "failed_login_attempts": 0,
        "last_login_at": func.now(),
        "refresh_token_jti": new_jti(),
    }
    if needs_rehash(claimed.password_hash):
        values["password_hash"] = await ahash_password(password)
    user = (
        await db.execute(
            update(User).where(User.id == claimed.id, _not_locked()).values(**values).returning(User)
        )
    ).scalar_one_or_none()
    await db.commit()
    if user is None:  # locked by a concurrent failure while we were hashing
        raise InvalidCredentials
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    assert user.refresh_token_jti is not None
    return (
        create_token(user.id, token_version=user.token_version, kind="access"),
        create_token(user.id, token_version=user.token_version, kind="refresh", jti=user.refresh_token_jti),
    )


async def user_from_token(db: AsyncSession, token: str | None, *, kind: TokenKind) -> User:
    """Validate a token against the database: user exists, is active, version matches."""
    if not token:
        raise InvalidSession
    try:
        claims = decode_token(token, kind=kind)
    except TokenError:
        raise InvalidSession from None
    user = await db.get(User, claims.user_id)
    if user is None or not user.is_active or user.token_version != claims.token_version:
        raise InvalidSession
    return user


async def rotate_refresh(db: AsyncSession, token: str | None) -> User:
    """Exchange a refresh token for a new pair. Reusing an old one revokes everything."""
    if not token:
        raise InvalidSession
    try:
        claims = decode_token(token, kind="refresh")
    except TokenError:
        raise InvalidSession from None
    rotated = (
        await db.execute(
            update(User)
            .where(
                User.id == claims.user_id,
                User.is_active,
                User.token_version == claims.token_version,
                User.refresh_token_jti == claims.jti,
            )
            .values(refresh_token_jti=new_jti())
            .returning(User)
        )
    ).scalar_one_or_none()
    if rotated is None:
        # Valid signature but not the current refresh token: replay of a stolen token,
        # or a revoked session. Revoke all sessions of that user.
        await db.execute(
            update(User)
            .where(User.id == claims.user_id, User.token_version == claims.token_version)
            .values(token_version=User.token_version + 1, refresh_token_jti=None)
        )
        await db.commit()
        raise InvalidSession
    await db.commit()
    return rotated


async def revoke_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(token_version=User.token_version + 1, refresh_token_jti=None)
    )
    await db.commit()
