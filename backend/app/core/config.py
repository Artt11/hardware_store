"""
Centralized Environment Configuration (`backend/app/core/config.py`).
Fixes BUG-10: Eliminates hardcoded tutorial secrets, loads secrets from `.env`,
and raises a ValidationError in production if insecure or placeholder keys are used.
"""

import secrets
from typing import List, Optional
from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

FORBIDDEN_WEAK_SECRETS = {
    "",
    "changeme",
    "secret",
    "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7",
    "d4e28fa0b92451f28b284e3658f28c5a4d49e6f3d179652a9f140645c36394e1",
    "replace_with_64_char_hex_secret_generated_by_openssl_rand_hex_32",
    "replace_with_distinct_64_char_hex_refresh_secret_key",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Suro Construction & Hardware E-Commerce API"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # PostgreSQL Environment Variables (loaded from .env)
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "hardware_store"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    DATABASE_URL_OVERRIDE: Optional[str] = None

    # Elasticsearch & Redis Configuration
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX: str = "hardware_products"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Cryptographic & JWT Security (Loaded from .env; ephemeral random fallback only in dev)
    SECRET_KEY: str = ""
    JWT_SECRET: str = ""
    JWT_REFRESH_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cookie & Rate Limiting Settings
    REFRESH_COOKIE_NAME: str = "auratools_refresh_token"
    COOKIE_HTTPONLY: bool = True
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    RATE_LIMIT_LOGIN_MAX: int = 5
    RATE_LIMIT_REGISTER_MAX: int = 5
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Strict CORS Origins (includes Next.js port 3000 & Vite port 5173)
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]

    @model_validator(mode="after")
    def validate_security_secrets(self) -> "Settings":
        is_prod = self.ENVIRONMENT.strip().lower() == "production"

        for field_name in ("SECRET_KEY", "JWT_SECRET", "JWT_REFRESH_SECRET"):
            val = getattr(self, field_name, "").strip()
            if is_prod and (val in FORBIDDEN_WEAK_SECRETS or len(val) < 32):
                raise ValueError(
                    f"CRITICAL SECURITY ERROR: `{field_name}` must be set in `.env` to a strong "
                    f"random secret (>= 32 chars) when ENVIRONMENT='production'."
                )
            if not val or val in FORBIDDEN_WEAK_SECRETS:
                # In local development only, generate an ephemeral cryptographic key per boot
                setattr(self, field_name, secrets.token_hex(32))

        if is_prod and not self.POSTGRES_PASSWORD:
            raise ValueError(
                "CRITICAL SECURITY ERROR: `POSTGRES_PASSWORD` must be explicitly configured in production."
            )
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL(self) -> str:
        """Async SQLAlchemy / asyncpg connection URI."""
        if self.DATABASE_URL_OVERRIDE:
            return self.DATABASE_URL_OVERRIDE
        auth = (
            f"{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            if self.POSTGRES_PASSWORD
            else self.POSTGRES_USER
        )
        return f"postgresql+asyncpg://{auth}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_SYNC_DATABASE_URI(self) -> str:
        """Synchronous SQLAlchemy / Alembic connection URI (psycopg2)."""
        auth = (
            f"{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            if self.POSTGRES_PASSWORD
            else self.POSTGRES_USER
        )
        return f"postgresql+psycopg2://{auth}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DOCKER_DATABASE_URL(self) -> str:
        """Fallback Docker PostgreSQL URI."""
        auth = (
            f"{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            if self.POSTGRES_PASSWORD
            else self.POSTGRES_USER
        )
        return f"postgresql+asyncpg://{auth}@localhost:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"


settings = Settings()
