"""Auth endpoints. Tokens are only ever sent as HttpOnly cookies (audit R2), never
in response bodies.

Development: access cookie Path=/api, refresh cookie Path=/api/v1/auth.
Production:  `__Host-` prefixed, Secure, Path=/ (blocks cookies planted from sibling
subdomains). SameSite is lax|strict, so the storefront must be served same-site as
the API (in dev the Vite server proxies /api to the backend).

A guest cart identified by X-Session-Token is merged into the account on login and
registration.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import CurrentUser, DbSession, single_cookie
from app.core.config import settings
from app.core.middleware import rate_limit
from app.core.security import TokenKind, default_lifetime
from app.models.session import UserSession
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserProfile
from app.services import auth as service
from app.services import cart as cart_service
from app.services.auth import InvalidSession

router = APIRouter(prefix="/auth", tags=["Authentication"])
GuestToken = Annotated[str | None, Header(alias="X-Session-Token", max_length=64)]

_window = settings.RATE_LIMIT_WINDOW_SECONDS
login_limit = rate_limit("login", max_requests=settings.RATE_LIMIT_LOGIN_MAX, window_seconds=_window)
register_limit = rate_limit("register", max_requests=settings.RATE_LIMIT_REGISTER_MAX, window_seconds=_window)
refresh_limit = rate_limit("refresh", max_requests=30, window_seconds=_window)


def _cookie_options() -> dict[str, Any]:
    return {"httponly": True, "secure": settings.COOKIE_SECURE, "samesite": settings.COOKIE_SAMESITE}


def _set_session_cookies(response: Response, user: User, session: UserSession) -> None:
    access, refresh = service.issue_tokens(user, session)
    response.set_cookie(
        settings.ACCESS_COOKIE_NAME,
        access,
        path=settings.access_cookie_path,
        # The cookie outlives the 15-minute JWT on purpose: an expired token must still
        # reach the API so optional-auth routes answer 401 (client refreshes) instead of
        # silently treating a signed-in customer as a guest (wrong prices, empty cart).
        max_age=int(default_lifetime("refresh").total_seconds()),
        **_cookie_options(),
    )
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        path=settings.refresh_cookie_path,
        max_age=int(default_lifetime("refresh").total_seconds()),
        **_cookie_options(),
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(settings.ACCESS_COOKIE_NAME, path=settings.access_cookie_path, **_cookie_options())
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME, path=settings.refresh_cookie_path, **_cookie_options()
    )


async def _merge_guest_cart(db: DbSession, user: User, guest_token: str | None) -> None:
    await cart_service.merge_guest_cart(db, user=user, guest_token=guest_token)
    await db.commit()


@router.post(
    "/register",
    response_model=UserProfile,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_limit)],
)
async def register(
    payload: RegisterRequest, response: Response, db: DbSession, guest_token: GuestToken = None
) -> UserProfile:
    try:
        user = await service.register(db, payload)
    except service.EmailTaken:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.") from None
    await _merge_guest_cart(db, user, guest_token)
    _set_session_cookies(response, user, await service.start_session(db, user))
    return UserProfile.model_validate(user)


@router.post("/login", response_model=UserProfile, dependencies=[Depends(login_limit)])
async def login(
    payload: LoginRequest, response: Response, db: DbSession, guest_token: GuestToken = None
) -> UserProfile:
    try:
        user = await service.authenticate(db, str(payload.email), payload.password)
    except service.InvalidCredentials:
        # One answer for wrong password, unknown email, locked or disabled account.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.") from None
    await _merge_guest_cart(db, user, guest_token)
    _set_session_cookies(response, user, await service.start_session(db, user))
    return UserProfile.model_validate(user)


@router.post("/refresh", response_model=UserProfile, dependencies=[Depends(refresh_limit)])
async def refresh(request: Request, db: DbSession) -> Response:
    """Rotates both tokens. An invalid, revoked or replayed refresh token clears the cookies."""
    try:
        user, session = await service.rotate_refresh(db, single_cookie(request, settings.REFRESH_COOKIE_NAME))
    except InvalidSession:
        expired = JSONResponse(
            {"detail": "Session expired. Please sign in again."}, status_code=status.HTTP_401_UNAUTHORIZED
        )
        _clear_session_cookies(expired)
        return expired
    response = JSONResponse(UserProfile.model_validate(user).model_dump(mode="json"))
    _set_session_cookies(response, user, session)
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, db: DbSession) -> Response:
    """Ends this device's session (its access and refresh tokens stop working at once);
    other devices stay signed in. Always clears cookies."""
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    sources: tuple[tuple[str, TokenKind], ...] = (
        (settings.ACCESS_COOKIE_NAME, "access"),
        (settings.REFRESH_COOKIE_NAME, "refresh"),
    )
    for cookie, kind in sources:
        if await service.end_session(db, single_cookie(request, cookie), kind=kind):
            break
    _clear_session_cookies(response)
    return response


@router.get("/me", response_model=UserProfile)
async def me(user: CurrentUser) -> UserProfile:
    return UserProfile.model_validate(user)
