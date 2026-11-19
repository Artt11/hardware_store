"""Shared FastAPI dependencies, declared with `Annotated` as the FastAPI docs recommend
(https://fastapi.tiangolo.com/tutorial/dependencies/#share-annotated-dependencies)."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import get_current_user_id

DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]
