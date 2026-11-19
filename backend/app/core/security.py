"""Password hashing (bcrypt) and JWTs (PyJWT, HS256).

- bcrypt is CPU-bound: async callers must use the `a*` wrappers (asyncio.to_thread).
- bcrypt only accepts 72 bytes; request schemas enforce MAX_PASSWORD_BYTES.
- Access and refresh tokens use different secrets and a `type` claim, carry the
  user's `token_version` as `ver`, and the algorithm list is pinned (no alg=none,
  no algorithm confusion).
"""

import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import settings

BCRYPT_ROUNDS = 12
MAX_PASSWORD_BYTES = 72
TokenKind = Literal["access", "refresh"]
ALGORITHMS = ["HS256"]

# Compared against when the email is unknown, so both paths cost one bcrypt check
# and response timing does not reveal which emails are registered (audit R5).
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt(BCRYPT_ROUNDS))


class TokenError(Exception):
    """Token is missing, malformed, expired, of the wrong kind, or forged."""


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: uuid.UUID
    token_version: int
    jti: str


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:  # malformed hash or over-long password
        return False


def needs_rehash(password_hash: str) -> bool:
    """True when a stored hash uses a different bcrypt cost than BCRYPT_ROUNDS."""
    return not password_hash.startswith(f"$2b${BCRYPT_ROUNDS:02d}$")


def verify_password_or_dummy(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        verify_password(password, _DUMMY_HASH.decode())
        return False
    return verify_password(password, password_hash)


async def ahash_password(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


async def averify_password_or_dummy(password: str, password_hash: str | None) -> bool:
    return await asyncio.to_thread(verify_password_or_dummy, password, password_hash)


def _secret(kind: TokenKind) -> str:
    secret = settings.JWT_SECRET if kind == "access" else settings.JWT_REFRESH_SECRET
    return secret.get_secret_value()


def default_lifetime(kind: TokenKind) -> timedelta:
    if kind == "access":
        return timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


def new_jti() -> str:
    return uuid.uuid4().hex


def create_token(
    user_id: uuid.UUID,
    *,
    token_version: int,
    kind: TokenKind,
    lifetime: timedelta | None = None,
    jti: str | None = None,
) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": str(user_id),
        "ver": token_version,
        "type": kind,
        "iat": now,
        "exp": now + (lifetime or default_lifetime(kind)),
        "jti": jti or new_jti(),
        "aud": settings.jwt_audience,
    }
    return jwt.encode(claims, _secret(kind), algorithm=ALGORITHMS[0])


def decode_token(token: str, *, kind: TokenKind) -> TokenClaims:
    try:
        claims = jwt.decode(
            token,
            _secret(kind),
            algorithms=ALGORITHMS,
            audience=settings.jwt_audience,
            options={"require": ["sub", "ver", "type", "iat", "exp", "aud", "jti"]},
        )
        if claims["type"] != kind:
            raise TokenError(f"expected a {kind} token")
        version = claims["ver"]
        if not isinstance(version, int) or isinstance(version, bool):
            raise TokenError("invalid token version")
        return TokenClaims(
            user_id=uuid.UUID(str(claims["sub"])), token_version=version, jti=str(claims["jti"])
        )
    except (jwt.InvalidTokenError, ValueError, KeyError) as exc:
        raise TokenError(str(exc)) from exc
