"""Instant search autocomplete. Full search is GET /products?q=..."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession, OptionalUser
from app.schemas.catalog import AutocompleteResponse, Lang
from app.services import catalog

router = APIRouter(prefix="/search", tags=["Search"])


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete(
    db: DbSession,
    user: OptionalUser,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    lang: Lang = "hy",
) -> AutocompleteResponse:
    term = q.strip()
    hits = (
        await catalog.autocomplete(db, term, limit=limit, is_b2b=bool(user and user.is_b2b), lang=lang)
        if term
        else []
    )
    return AutocompleteResponse(query=term, products=hits)
