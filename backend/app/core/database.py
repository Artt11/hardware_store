"""
PostgreSQL Database Connection Pool & SQLAlchemy AsyncSession Dependency.
Automatically negotiates connection across Docker PostgreSQL (`postgres:postgrespassword`)
and local PostgreSQL (`admin@localhost:5432/hardware_store`).
"""

import os
from typing import AsyncGenerator, List, Optional

import asyncpg
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

_pg_pool: Optional[asyncpg.Pool] = None
_async_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None
_active_dsn: Optional[str] = None


def get_candidate_dsns() -> List[str]:
    """Return ordered list of PostgreSQL DSNs to try (Docker, env, local macOS)."""
    env_url = os.getenv("DATABASE_URL", "")
    candidates = [
        env_url,
        settings.DATABASE_URL,
        settings.DOCKER_DATABASE_URL,
        "postgresql://admin@localhost:5432/hardware_store",
        "postgresql://postgres:postgrespassword@localhost:5432/hardware_store",
        "postgresql://postgres:postgres@localhost:5432/hardware_store",
        "postgresql://postgres:postgrespassword@postgres:5432/hardware_store",
    ]
    seen = set()
    normalized: List[str] = []
    for raw in candidates:
        if not raw:
            continue
        clean = (
            raw.replace("postgresql+asyncpg://", "postgresql://")
            .replace("postgresql+psycopg2://", "postgresql://")
        )
        if clean not in seen:
            seen.add(clean)
            normalized.append(clean)
    return normalized


async def init_db_pool() -> Optional[asyncpg.Pool]:
    """Initialize and cache the shared asyncpg connection pool and SQLAlchemy async engine."""
    global _pg_pool, _async_engine, _session_factory, _active_dsn
    if _pg_pool is not None and _session_factory is not None:
        return _pg_pool

    for dsn in get_candidate_dsns():
        try:
            pool = await asyncpg.create_pool(
                dsn=dsn,
                min_size=2,
                max_size=12,
                command_timeout=15.0,
                timeout=2.5,
            )
            _pg_pool = pool
            _active_dsn = dsn
            sa_url = dsn.replace("postgresql://", "postgresql+asyncpg://")
            _async_engine = create_async_engine(sa_url, pool_pre_ping=True, future=True)
            _session_factory = async_sessionmaker(
                _async_engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            return _pg_pool
        except Exception:
            continue

    return None


async def get_db_pool() -> Optional[asyncpg.Pool]:
    """Get the active asyncpg pool, initializing it if needed."""
    global _pg_pool
    if _pg_pool is None:
        return await init_db_pool()
    return _pg_pool


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI Dependency yielding a SQLAlchemy `AsyncSession` connected to PostgreSQL.
    Automatically commits or rolls back on exception.
    """
    global _session_factory
    if _session_factory is None:
        await init_db_pool()
    if _session_factory is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PostgreSQL database session is unavailable.",
        )

    async with _session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def close_db_pool() -> None:
    """Gracefully close the PostgreSQL pool and SQLAlchemy engine on shutdown."""
    global _pg_pool, _async_engine, _session_factory
    if _pg_pool is not None:
        await _pg_pool.close()
        _pg_pool = None
    if _async_engine is not None:
        await _async_engine.dispose()
        _async_engine = None
    _session_factory = None


def get_active_dsn() -> Optional[str]:
    return _active_dsn
