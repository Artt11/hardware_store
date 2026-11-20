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

Sessions: every sign-in creates a `user_sessions` row (one per device). Both tokens
carry its id (`sid`) and the user's `token_version` (bumped to revoke everything).
Refresh rotates the row's jti under a row lock; a just-rotated jti stays valid for a
short grace window (parallel tabs), any other stale jti is treated as theft and
deletes that session only. See app/models/session.py.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, case, delete, func, or_, select, update
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
    default_lifetime,
    needs_rehash,
    new_jti,
)
from app.models.session import UserSession
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


async def start_session(db: AsyncSession, user: User) -> UserSession:
    """Open a refresh session for a new sign-in (and drop this user's expired ones)."""
    now = datetime.now(UTC)
    await db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at <= now))
    session = UserSession(
        user_id=user.id, current_jti=new_jti(), expires_at=now + default_lifetime("refresh")
    )
    db.add(session)
    await db.commit()
    return session


def issue_tokens(user: User, session: UserSession) -> tuple[str, str]:
    version, sid = user.token_version, session.id
    return (
        create_token(user.id, token_version=version, kind="access", session_id=sid),
        create_token(user.id, token_version=version, kind="refresh", jti=session.current_jti, session_id=sid),
    )


async def user_from_token(db: AsyncSession, token: str | None, *, kind: TokenKind) -> User:
    """Validate a token against the database: user exists, is active, version matches,
    and its session has not been ended (logout, theft) or expired. One query."""
    if not token:
        raise InvalidSession
    try:
        claims = decode_token(token, kind=kind)
    except TokenError:
        raise InvalidSession from None
    if claims.session_id is None:
        raise InvalidSession
    user = (
        await db.execute(
            select(User)
            .join(UserSession, UserSession.user_id == User.id)
            .where(
                User.id == claims.user_id,
                User.is_active,
                User.token_version == claims.token_version,
                UserSession.id == claims.session_id,
                UserSession.expires_at > func.now(),
            )
        )
    ).scalar_one_or_none()
    if user is None:
        raise InvalidSession
    return user


async def rotate_refresh(db: AsyncSession, token: str | None) -> tuple[User, UserSession]:
    """Exchange a refresh token for a new pair.

    The session row is locked, so simultaneous refreshes with one token serialise:
    the first rotates, the others find their jti in `previous_jti` within the grace
    window and receive the rotated session. A stale jti outside the window is a
    replayed (stolen) token: that session is deleted and the request refused.
    """
    if not token:
        raise InvalidSession
    try:
        claims = decode_token(token, kind="refresh")
    except TokenError:
        raise InvalidSession from None
    if claims.session_id is None:
        raise InvalidSession

    session = (
        await db.execute(
            select(UserSession)
            .where(UserSession.id == claims.session_id, UserSession.user_id == claims.user_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    user = await db.get(User, claims.user_id)
    if (
        session is None
        or session.expires_at <= now
        or user is None
        or not user.is_active
        or user.token_version != claims.token_version
    ):
        await db.rollback()
        raise InvalidSession

    grace = timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)
    if claims.jti == session.current_jti:
        session.previous_jti = session.current_jti
        session.current_jti = new_jti()
        session.rotated_at = now
        session.expires_at = now + default_lifetime("refresh")
    elif not (
        claims.jti == session.previous_jti
        and session.rotated_at is not None
        and now - session.rotated_at <= grace
    ):
        await db.delete(session)  # replay of an old token: end this token family
        await db.commit()
        raise InvalidSession
    await db.commit()
    return user, session


async def end_session(db: AsyncSession, token: str | None, *, kind: TokenKind) -> bool:
    """Delete the session a (possibly expired-access but validly signed) token belongs to."""
    if not token:
        return False
    try:
        claims = decode_token(token, kind=kind)
    except TokenError:
        return False
    if claims.session_id is None:
        return False
    result = await db.execute(
        delete(UserSession).where(UserSession.id == claims.session_id, UserSession.user_id == claims.user_id)
    )
    await db.commit()
    return bool(result.rowcount)  # type: ignore[attr-defined]
