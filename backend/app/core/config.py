"""Application settings from environment / .env (pydantic-settings).

In production the app refuses to start with weak or missing secrets, a missing
database password, insecure cookies, or localhost CORS origins.
"""

import logging
import re
import secrets
from functools import cached_property
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

logger = logging.getLogger(__name__)

WEAK_SECRETS = {
    "changeme",
    "secret",
    "password",
    "replace_with_64_char_hex_secret_generated_by_openssl_rand_hex_32",
    "replace_with_distinct_64_char_hex_refresh_secret_key",
}
MIN_SECRET_LENGTH = 32
MIN_DISTINCT_CHARS = 16


def _is_strong(value: str) -> bool:
    return (
        len(value) >= MIN_SECRET_LENGTH
        and value.lower() not in WEAK_SECRETS
        and len(set(value)) >= MIN_DISTINCT_CHARS
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Suro Hardware Store API"
    API_V1_PREFIX: str = "/api/v1"
    # Required, no default: forgetting it must fail closed, not run dev settings in production.
    ENVIRONMENT: Literal["development", "test", "production"]

    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: SecretStr = SecretStr("")
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "hardware_store"
    DB_POOL_SIZE: int = Field(default=10, ge=1, le=100)
    DB_MAX_OVERFLOW: int = Field(default=5, ge=0, le=100)

    JWT_SECRET: SecretStr = SecretStr("")
    JWT_REFRESH_SECRET: SecretStr = SecretStr("")
    JWT_ALGORITHM: Literal["HS256"] = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15, ge=1, le=60)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, ge=1, le=30)
    # A just-rotated refresh token is still accepted this long (parallel tabs refreshing at once).
    REFRESH_REUSE_GRACE_SECONDS: int = Field(default=15, ge=0, le=60)

    ACCESS_COOKIE_NAME: str = "suro_access"
    REFRESH_COOKIE_NAME: str = "suro_refresh"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict"] = "lax"

    RATE_LIMIT_LOGIN_MAX: int = 5
    RATE_LIMIT_REGISTER_MAX: int = 5
    RATE_LIMIT_CHECKOUT_MAX: int = 10
    RATE_LIMIT_WINDOW_SECONDS: int = Field(default=60, ge=1, le=3600)
    # Requests from these proxy IPs may set X-Forwarded-For; everyone else is keyed by peer IP.
    TRUSTED_PROXY_IPS: list[str] = []
    LOGIN_LOCKOUT_THRESHOLD: int = 10
    LOGIN_LOCKOUT_MINUTES: int = 15

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def jwt_audience(self) -> str:
        """Tokens from one environment are rejected by another even if secrets leak across."""
        return f"suro-api:{self.ENVIRONMENT}"

    @property
    def access_cookie_path(self) -> str:
        # __Host- cookies (production) must use Path=/.
        return "/" if self.is_production else "/api"

    @property
    def refresh_cookie_path(self) -> str:
        return "/" if self.is_production else f"{self.API_V1_PREFIX}/auth"

    @cached_property
    def DATABASE_URL(self) -> str:  # noqa: N802 - settings-style name
        """asyncpg URL; URL.create escapes special characters in the password."""
        return URL.create(
            "postgresql+asyncpg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD.get_secret_value() or None,
            host=self.POSTGRES_HOST,
            port=self.POSTGRES_PORT,
            database=self.POSTGRES_DB,
        ).render_as_string(hide_password=False)

    @model_validator(mode="after")
    def _enforce_safe_configuration(self) -> "Settings":
        access = self.JWT_SECRET.get_secret_value()
        refresh = self.JWT_REFRESH_SECRET.get_secret_value()

        if self.is_production:
            errors: list[str] = []
            if not _is_strong(access):
                errors.append("JWT_SECRET must be a strong random value (>= 32 chars)")
            if not _is_strong(refresh):
                errors.append("JWT_REFRESH_SECRET must be a strong random value (>= 32 chars)")
            if access and access == refresh:
                errors.append("JWT_SECRET and JWT_REFRESH_SECRET must differ")
            if not self.POSTGRES_PASSWORD.get_secret_value():
                errors.append("POSTGRES_PASSWORD is required in production")
            if not self.CORS_ORIGINS:
                errors.append("CORS_ORIGINS must list the storefront origin in production")
            for origin in self.CORS_ORIGINS:
                if not re.fullmatch(r"https://[a-z0-9.-]+(:[0-9]{1,5})?", origin) or "localhost" in origin:
                    errors.append(f"CORS_ORIGINS entry {origin!r} must be a bare https:// origin")
            if errors:
                raise ValueError("; ".join(errors))
            self.COOKIE_SECURE = True
            # __Host- prefix: Secure, Path=/, no Domain, so sibling subdomains cannot plant cookies.
            for name in ("ACCESS_COOKIE_NAME", "REFRESH_COOKIE_NAME"):
                value = getattr(self, name)
                if not value.startswith("__Host-"):
                    setattr(self, name, f"__Host-{value}")
            return self

        # Development/test: ephemeral secrets keep the app runnable without a .env.
        # Tokens become invalid on restart and differ per worker (run one worker in dev).
        if not access:
            self.JWT_SECRET = SecretStr(secrets.token_urlsafe(48))
            logger.warning("JWT_SECRET not set; using an ephemeral development secret")
        if not refresh:
            self.JWT_REFRESH_SECRET = SecretStr(secrets.token_urlsafe(48))
            logger.warning("JWT_REFRESH_SECRET not set; using an ephemeral development secret")
        return self


settings = Settings()
