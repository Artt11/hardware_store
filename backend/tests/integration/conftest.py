"""Integration fixtures against a real, throwaway PostgreSQL database.

- `migrated_db` (session): creates `<db>_test`, runs `alembic upgrade head`, drops it at the end.
- `db_session` (function): an AsyncSession joined to an outer transaction with
  join_transaction_mode="create_savepoint", so code under test may commit freely and
  everything is rolled back afterwards. Recipe:
  https://docs.sqlalchemy.org/en/21/orm/session_transaction.html#joining-a-session-into-an-external-transaction-such-as-for-test-suites
"""

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import asyncpg
import pytest
from alembic.config import Config
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from alembic import command
from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
# en_US.UTF-8 exists on macOS; Debian/Alpine images usually provide C.UTF-8.
DB_LOCALE = os.environ.get("TEST_DB_LOCALE", "en_US.UTF-8")


def _test_url() -> URL:
    base = make_url(settings.DATABASE_URL)
    return base.set(database=f"{base.database}_test")


def _asyncpg_dsn(url: URL, database: str) -> str:
    return url.set(drivername="postgresql", database=database).render_as_string(hide_password=False)


def alembic_config(url: URL) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # ConfigParser interpolation: a literal '%' in the password must be doubled.
    cfg.set_main_option("sqlalchemy.url", url.render_as_string(hide_password=False).replace("%", "%%"))
    cfg.attributes["configure_logger"] = False
    return cfg


async def _recreate_database(url: URL) -> None:
    conn = await asyncpg.connect(_asyncpg_dsn(url, "postgres"))
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)')
        # UTF-8 ctype is required: under the C locale pg_trgm and ILIKE ignore Armenian letters.
        await conn.execute(
            f'CREATE DATABASE "{url.database}" TEMPLATE template0 ENCODING \'UTF8\' '
            f"LC_COLLATE '{DB_LOCALE}' LC_CTYPE '{DB_LOCALE}'"
        )
    finally:
        await conn.close()


async def _drop_database(url: URL) -> None:
    conn = await asyncpg.connect(_asyncpg_dsn(url, "postgres"))
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)')
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def test_db_url() -> URL:
    url = _test_url()
    assert url.database and url.database.endswith("_test"), "refusing to touch a non-test database"
    return url


@pytest.fixture(scope="session")
async def migrated_db(test_db_url: URL) -> AsyncIterator[URL]:
    await _recreate_database(test_db_url)
    # env.py calls asyncio.run(); run Alembic in a worker thread so it gets its own loop.
    await asyncio.to_thread(command.upgrade, alembic_config(test_db_url), "head")
    yield test_db_url
    await _drop_database(test_db_url)


@pytest.fixture(scope="session")
async def engine(migrated_db: URL) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(migrated_db)
    yield eng
    await eng.dispose()


@pytest.fixture
async def db_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await outer.rollback()


@pytest.fixture
def alembic_cfg(migrated_db: URL) -> Iterator[Config]:
    yield alembic_config(migrated_db)
