"""Password hashing and JWT handling (Phase 2a)."""

import time
import uuid
from datetime import timedelta

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    TokenError,
    create_token,
    decode_token,
    hash_password,
    verify_password,
    verify_password_or_dummy,
)

USER_ID = uuid.UUID("11111111-2222-3333-4444-555555555555")


def test_hash_and_verify_round_trip() -> None:
    hashed = hash_password("Correct-horse-9")
    assert hashed.startswith("$2b$12$")
    assert verify_password("Correct-horse-9", hashed)
    assert not verify_password("wrong-password-9", hashed)


def test_verify_handles_armenian_passwords() -> None:
    hashed = hash_password("Գաղտնաբառ-2026")
    assert verify_password("Գաղտնաբառ-2026", hashed)


def test_verify_returns_false_for_malformed_hash() -> None:
    assert verify_password("anything", "not-a-bcrypt-hash") is False


def test_verify_or_dummy_spends_bcrypt_time_when_user_missing() -> None:
    start = time.perf_counter()
    assert verify_password_or_dummy("whatever-123", None) is False
    assert time.perf_counter() - start > 0.05  # a real bcrypt comparison ran


def test_access_token_round_trip() -> None:
    token = create_token(USER_ID, token_version=3, kind="access")
    claims = decode_token(token, kind="access")
    assert claims.user_id == USER_ID
    assert claims.token_version == 3


def test_access_token_is_rejected_as_refresh_token() -> None:
    token = create_token(USER_ID, token_version=1, kind="access")
    with pytest.raises(TokenError):
        decode_token(token, kind="refresh")


def test_refresh_token_signed_with_separate_secret() -> None:
    token = create_token(USER_ID, token_version=1, kind="refresh")
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, settings.JWT_SECRET.get_secret_value(), algorithms=["HS256"])


def test_expired_token_is_rejected() -> None:
    token = create_token(USER_ID, token_version=1, kind="access", lifetime=timedelta(seconds=-30))
    with pytest.raises(TokenError):
        decode_token(token, kind="access")


def test_unsigned_alg_none_token_is_rejected() -> None:
    forged = jwt.encode(
        {
            "sub": str(USER_ID),
            "ver": 1,
            "type": "access",
            "iat": int(time.time()),
            "exp": int(time.time()) + 60,
        },
        key="",
        algorithm="none",
    )
    with pytest.raises(TokenError):
        decode_token(forged, kind="access")


def test_token_missing_version_claim_is_rejected() -> None:
    now = int(time.time())
    token = jwt.encode(
        {"sub": str(USER_ID), "type": "access", "iat": now, "exp": now + 60},
        settings.JWT_SECRET.get_secret_value(),
        algorithm="HS256",
    )
    with pytest.raises(TokenError):
        decode_token(token, kind="access")


def test_garbage_token_is_rejected() -> None:
    with pytest.raises(TokenError):
        decode_token("not.a.jwt", kind="access")
