"""Settings validation (Phase 2): production must refuse to start with weak config."""

from typing import Any

import pytest
from pydantic import ValidationError

from app.core.config import Settings

STRONG_A = "aB7c9D1e3F5g7H9j1K3m5N7p9qRsTuVwXyZ0"
STRONG_B = "zQ2w4E6r8T0y2U4i6O8p0A2s4dFgHjKlMnBv"


def prod(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "ENVIRONMENT": "production",
        "POSTGRES_USER": "suro",
        "POSTGRES_PASSWORD": "S3cure-db-password",
        "POSTGRES_HOST": "db",
        "JWT_SECRET": STRONG_A,
        "JWT_REFRESH_SECRET": STRONG_B,
        "CORS_ORIGINS": ["https://suro.am"],
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_valid_production_settings_load() -> None:
    assert prod().is_production


@pytest.mark.parametrize("secret", ["", "changeme", "short-secret", "x" * 40])
def test_production_rejects_weak_jwt_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        prod(JWT_SECRET=secret)


def test_production_rejects_identical_access_and_refresh_secrets() -> None:
    with pytest.raises(ValidationError, match="must differ"):
        prod(JWT_REFRESH_SECRET=STRONG_A)


def test_production_requires_database_password() -> None:
    with pytest.raises(ValidationError, match="POSTGRES_PASSWORD"):
        prod(POSTGRES_PASSWORD="")


def test_production_forces_secure_cookies() -> None:
    assert prod(COOKIE_SECURE=False).COOKIE_SECURE is True


def test_production_rejects_localhost_cors_origins() -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        prod(CORS_ORIGINS=["http://localhost:5173"])


def test_development_generates_ephemeral_secrets_when_missing() -> None:
    s = Settings(_env_file=None, ENVIRONMENT="development", JWT_SECRET="", JWT_REFRESH_SECRET="")
    assert len(s.JWT_SECRET.get_secret_value()) >= 32
    assert s.JWT_SECRET.get_secret_value() != s.JWT_REFRESH_SECRET.get_secret_value()


def test_database_url_escapes_special_characters_in_password() -> None:
    s = prod(POSTGRES_PASSWORD="p@ss:w/rd%")
    assert "p%40ss%3Aw%2Frd%25" in s.DATABASE_URL
    assert s.DATABASE_URL.startswith("postgresql+asyncpg://suro:")


def test_secrets_are_not_shown_in_repr() -> None:
    assert STRONG_A not in repr(prod())


@pytest.mark.parametrize(
    "origin", ["*", "null", "http://suro.am", "https://suro.am/path", "https://localhost"]
)
def test_production_rejects_unsafe_cors_origins(origin: str) -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        prod(CORS_ORIGINS=[origin])


def test_environment_is_required() -> None:
    with pytest.raises(ValidationError, match="ENVIRONMENT"):
        Settings(_env_file=None, _env_prefix="NO_SUCH_PREFIX_")


def test_production_uses_host_prefixed_cookies_with_root_path() -> None:
    s = prod()
    assert s.ACCESS_COOKIE_NAME.startswith("__Host-")
    assert s.REFRESH_COOKIE_NAME.startswith("__Host-")
    assert s.access_cookie_path == s.refresh_cookie_path == "/"


def test_low_entropy_secret_is_rejected() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        prod(JWT_SECRET="abcdefghij" * 4)
