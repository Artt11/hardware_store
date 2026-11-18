# """
# PostgreSQL-Backed Authentication & Session Endpoints (`backend/app/api/v1/endpoints/auth.py`).
# Fixes:
# - BUG-01: Persists all B2C/B2B users, failed login counters, and token revocations in PostgreSQL.
# - ISSUE-03: Uses `async_hash_password` and `async_verify_password` via `asyncio.to_thread` to avoid blocking the event loop.
# - ISSUE-05: Idempotently seeds the demo B2C (`admin@auratools.com`) and B2B (`contractor@buildcorp.com`) accounts into PostgreSQL.
# - ISSUE-12: Verifies `user.token_version` and `user.is_active` in `/api/v1/auth/me` so revoked access tokens are rejected immediately.
# """

# from datetime import datetime, timezone
# from decimal import Decimal
# from typing import Any, Dict
# from uuid import UUID, uuid4, uuid5

# from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
# from sqlalchemy import func, select
# from sqlalchemy.ext.asyncio import AsyncSession

# from app.core.config import settings
# from app.core.database import get_db_session
# from app.core.middleware import rate_limiter
# from app.core.security import (
#     async_hash_password,
#     async_verify_password,
#     create_access_token,
#     create_refresh_token,
#     decode_refresh_token,
#     get_current_user_payload,
# )
# from app.models.user import User
# from app.schemas.auth import (
#     LoginRequest,
#     RegisterRequest,
#     TokenResponse,
#     UserProfileResponse,
# )

# router = APIRouter(prefix="/auth", tags=["Authentication & Security"])

# DEMO_USER_NAMESPACE = UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
# _DEMO_USERS_SEEDED: bool = False


# async def ensure_demo_users_seeded(db: AsyncSession) -> None:
#     """
#     ISSUE-05 Fix: Idempotently ensures the documented B2C and B2B demo accounts
#     exist in PostgreSQL (`users` table) so one-click demo sign-in always succeeds.
#     """
#     global _DEMO_USERS_SEEDED
#     if _DEMO_USERS_SEEDED:
#         return

#     demo_specs = [
#         {
#             "email": "admin@auratools.com",
#             "password": "AdminSecure2026!",
#             "account_type": "individual",
#             "role": "admin",
#             "first_name": "Արամ",
#             "last_name": "Պետրոսյան",
#             "company_name": None,
#             "tax_id": None,
#             "contact_person": None,
#             "phone": "+374 91 00 11 22",
#             "credit_limit": Decimal("0.00"),
#             "payment_terms_days": 0,
#             "trade_discount_tier": Decimal("0.00"),
#         },
#         {
#             "email": "contractor@buildcorp.com",
#             "password": "BuildCorpSecure#1",
#             "account_type": "company",
#             "role": "b2b_contractor",
#             "first_name": "Դավիթ",
#             "last_name": "Հակոբյան",
#             "company_name": "BuildCorp Armenia LLC",
#             "tax_id": "01234567",
#             "contact_person": "Դավիթ Հակոբյան",
#             "phone": "+374 99 88 77 66",
#             "credit_limit": Decimal("5000000.00"),
#             "payment_terms_days": 30,
#             "trade_discount_tier": Decimal("12.00"),
#         },
#     ]

#     created_any = False
#     for spec in demo_specs:
#         stmt = select(User).where(func.lower(User.email) == spec["email"])
#         existing = (await db.execute(stmt)).scalar_one_or_none()
#         if existing is None:
#             pw_hash = await async_hash_password(spec["password"])
#             db.add(
#                 User(
#                     id=uuid5(DEMO_USER_NAMESPACE, f"demo-user-{spec['email']}"),
#                     email=spec["email"],
#                     password_hash=pw_hash,
#                     account_type=spec["account_type"],
#                     role=spec["role"],
#                     first_name=spec["first_name"],
#                     last_name=spec["last_name"],
#                     company_name=spec["company_name"],
#                     tax_id=spec["tax_id"],
#                     contact_person=spec["contact_person"],
#                     phone=spec["phone"],
#                     credit_limit=spec["credit_limit"],
#                     payment_terms_days=spec["payment_terms_days"],
#                     trade_discount_tier=spec["trade_discount_tier"],
#                     token_version=1,
#                     is_active=True,
#                     is_verified=True,
#                 )
#             )
#             created_any = True

#     if created_any:
#         await db.commit()
#     _DEMO_USERS_SEEDED = True


# def set_refresh_cookie(response: Response, refresh_token: str) -> None:
#     """Store the refresh token exclusively in an HttpOnly cookie."""
#     response.set_cookie(
#         key=settings.REFRESH_COOKIE_NAME,
#         value=refresh_token,
#         httponly=settings.COOKIE_HTTPONLY,
#         secure=settings.COOKIE_SECURE,
#         samesite=settings.COOKIE_SAMESITE,
#         max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
#         path="/",
#     )


# @router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
# async def register(
#     payload: RegisterRequest,
#     request: Request,
#     response: Response,
#     db: AsyncSession = Depends(get_db_session),
# ):
#     """
#     Dual Registration endpoint supporting B2C Individuals and B2B Companies.
#     Persists directly to the PostgreSQL `users` table via SQLAlchemy ORM.
#     """
#     rate_limiter.check_rate_limit(
#         request,
#         "register",
#         max_requests=settings.RATE_LIMIT_REGISTER_MAX,
#         window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
#     )

#     clean_email = payload.email.lower().strip()
#     existing_stmt = select(User).where(func.lower(User.email) == clean_email)
#     existing_user = (await db.execute(existing_stmt)).scalar_one_or_none()
#     if existing_user is not None:
#         raise HTTPException(
#             status_code=status.HTTP_409_CONFLICT,
#             detail="An account with this email address already exists.",
#         )

#     pw_hash = await async_hash_password(payload.password)
#     new_user = User(
#         id=uuid4(),
#         email=clean_email,
#         password_hash=pw_hash,
#         account_type=payload.account_type,
#         role="b2b_contractor" if payload.account_type == "company" else "customer",
#         first_name=payload.first_name,
#         last_name=payload.last_name,
#         company_name=payload.company_name,
#         tax_id=payload.tax_id,
#         contact_person=payload.contact_person,
#         phone=payload.phone,
#         token_version=1,
#         is_active=True,
#         is_verified=False,
#     )
#     db.add(new_user)
#     await db.commit()
#     await db.refresh(new_user)

#     token_payload = {
#         "sub": str(new_user.id),
#         "email": new_user.email,
#         "role": new_user.role,
#         "account_type": new_user.account_type,
#         "token_version": new_user.token_version,
#     }
#     access_token = create_access_token(token_payload)
#     refresh_token = create_refresh_token(token_payload)
#     set_refresh_cookie(response, refresh_token)

#     return TokenResponse(
#         access_token=access_token,
#         expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
#     )


# @router.post("/login", response_model=TokenResponse)
# async def login(
#     payload: LoginRequest,
#     request: Request,
#     response: Response,
#     db: AsyncSession = Depends(get_db_session),
# ):
#     """
#     Authenticates user against PostgreSQL `users` table, sets HttpOnly refresh cookie,
#     and returns short-lived access token.
#     """
#     rate_limiter.check_rate_limit(
#         request,
#         "login",
#         max_requests=settings.RATE_LIMIT_LOGIN_MAX,
#         window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
#     )

#     await ensure_demo_users_seeded(db)

#     clean_email = payload.email.lower().strip()
#     stmt = select(User).where(func.lower(User.email) == clean_email)
#     user = (await db.execute(stmt)).scalar_one_or_none()

#     password_valid = (
#         await async_verify_password(payload.password, user.password_hash)
#         if user is not None
#         else False
#     )
#     if user is None or not password_valid:
#         if user is not None:
#             user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
#             await db.commit()
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid email or password combination.",
#         )

#     if not user.is_active:
#         raise HTTPException(
#             status_code=status.HTTP_403_FORBIDDEN,
#             detail="Account is deactivated.",
#         )

#     user.failed_login_attempts = 0
#     user.last_login_at = datetime.now(timezone.utc)
#     await db.commit()

#     token_payload = {
#         "sub": str(user.id),
#         "email": user.email,
#         "role": user.role,
#         "account_type": user.account_type,
#         "token_version": user.token_version,
#     }
#     access_token = create_access_token(token_payload)
#     refresh_token = create_refresh_token(token_payload)
#     set_refresh_cookie(response, refresh_token)

#     return TokenResponse(
#         access_token=access_token,
#         expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
#     )


# @router.post("/refresh", response_model=TokenResponse)
# async def refresh_access_token(
#     request: Request,
#     response: Response,
#     db: AsyncSession = Depends(get_db_session),
# ):
#     """
#     Silent token refresh: reads HttpOnly cookie, verifies `token_version` in PostgreSQL,
#     and rotates both Access and Refresh tokens.
#     """
#     refresh_cookie = request.cookies.get(settings.REFRESH_COOKIE_NAME)
#     if not refresh_cookie:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Refresh token missing. Please sign in.",
#         )

#     payload = decode_refresh_token(refresh_cookie)
#     user_id_str = payload.get("sub")
#     token_version = payload.get("token_version", 1)

#     try:
#         user_uuid = UUID(str(user_id_str))
#     except (ValueError, TypeError):
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid token subject.",
#         )

#     stmt = select(User).where(User.id == user_uuid)
#     user = (await db.execute(stmt)).scalar_one_or_none()
#     if user is None or user.token_version != token_version or not user.is_active:
#         response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/")
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Session has been revoked. Please sign in again.",
#         )

#     new_payload = {
#         "sub": str(user.id),
#         "email": user.email,
#         "role": user.role,
#         "account_type": user.account_type,
#         "token_version": user.token_version,
#     }
#     new_access_token = create_access_token(new_payload)
#     new_refresh_token = create_refresh_token(new_payload)
#     set_refresh_cookie(response, new_refresh_token)

#     return TokenResponse(
#         access_token=new_access_token,
#         expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
#     )


# @router.post("/logout", status_code=status.HTTP_200_OK)
# async def logout(
#     response: Response,
#     auth_payload: Dict[str, Any] = Depends(get_current_user_payload),
#     db: AsyncSession = Depends(get_db_session),
# ):
#     """
#     Secure logout: increments `token_version` in PostgreSQL to revoke all active tokens
#     and clears the HttpOnly cookie.
#     """
#     user_id_str = auth_payload.get("sub")
#     if user_id_str:
#         try:
#             stmt = select(User).where(User.id == UUID(str(user_id_str)))
#             user = (await db.execute(stmt)).scalar_one_or_none()
#             if user is not None:
#                 user.token_version = (user.token_version or 1) + 1
#                 await db.commit()
#         except Exception:
#             await db.rollback()

#     response.delete_cookie(key=settings.REFRESH_COOKIE_NAME, path="/")
#     return {"message": "Successfully logged out. Session revoked."}


# @router.get("/me", response_model=UserProfileResponse)
# async def get_current_user_profile(
#     auth_payload: Dict[str, Any] = Depends(get_current_user_payload),
#     db: AsyncSession = Depends(get_db_session),
# ):
#     """
#     Fetch authenticated user profile from PostgreSQL `users` table.
#     ISSUE-12 Fix: Verifies `user.is_active` and `user.token_version` against the JWT claim.
#     """
#     user_id_str = auth_payload.get("sub")
#     token_version = auth_payload.get("token_version", 1)
#     try:
#         user_uuid = UUID(str(user_id_str))
#     except (ValueError, TypeError):
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid user identifier.",
#         )

#     stmt = select(User).where(User.id == user_uuid)
#     user = (await db.execute(stmt)).scalar_one_or_none()
#     if user is None:
#         raise HTTPException(
#             status_code=status.HTTP_404_NOT_FOUND,
#             detail="User profile not found.",
#         )

#     if not user.is_active or user.token_version != token_version:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Session has been revoked or deactivated. Please sign in again.",
#         )

#     return UserProfileResponse.model_validate(user)
"""
PostgreSQL-Backed Authentication & Session Endpoints (`backend/app/api/v1/endpoints/auth.py`).
Fixes:
- BUG-01: Persists all B2C/B2B users, failed login counters, and token revocations in PostgreSQL.
- ISSUE-03 [Applying Skill: Concurrency]: Uses `async_hash_password` and `async_verify_password` via `asyncio.to_thread` to avoid blocking the event loop.
- ISSUE-12: Verifies `user.token_version` and `user.is_active` in `/api/v1/auth/me` so revoked access tokens are rejected immediately.
"""

from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_session
from app.core.middleware import rate_limiter
from app.core.security import (
    async_hash_password,
    async_verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user_payload,
)
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserProfileResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication & Security"])


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Store the refresh token exclusively in an HttpOnly cookie."""
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=settings.COOKIE_HTTPONLY,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    """
    Dual Registration endpoint supporting B2C Individuals and B2B Companies.
    Persists directly to the PostgreSQL `users` table via SQLAlchemy ORM.
    """
    rate_limiter.check_rate_limit(
        request,
        "register",
        max_requests=settings.RATE_LIMIT_REGISTER_MAX,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )

    clean_email = payload.email.lower().strip()
    existing_stmt = select(User.id).where(
        func.lower(User.email) == clean_email)
    existing_user_id = (await db.execute(existing_stmt)).scalar_one_or_none()

    if existing_user_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    # [Applying Skill: Event Loop Safety]
    pw_hash = await async_hash_password(payload.password)

    new_user = User(
        id=uuid4(),
        email=clean_email,
        password_hash=pw_hash,
        account_type=payload.account_type,
        role="b2b_contractor" if payload.account_type == "company" else "customer",
        first_name=payload.first_name,
        last_name=payload.last_name,
        company_name=payload.company_name,
        tax_id=payload.tax_id,
        contact_person=payload.contact_person,
        phone=payload.phone,
        token_version=1,
        is_active=True,
        is_verified=False,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token_payload = {
        "sub": str(new_user.id),
        "email": new_user.email,
        "role": new_user.role,
        "account_type": new_user.account_type,
        "token_version": new_user.token_version,
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)
    set_refresh_cookie(response, refresh_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    rate_limiter.check_rate_limit(
        request,
        "login",
        max_requests=settings.RATE_LIMIT_LOGIN_MAX,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )

    clean_email = payload.email.lower().strip()
    stmt = select(User).where(func.lower(User.email) == clean_email)
    user = (await db.execute(stmt)).scalar_one_or_none()

    # [Applying Skill: Event Loop Safety]
    password_valid = (
        await async_verify_password(payload.password, user.password_hash)
        if user is not None
        else False
    )

    if user is None or not password_valid:
        if user is not None:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password combination.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated.",
        )

    user.failed_login_attempts = 0
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    token_payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "account_type": user.account_type,
        "token_version": user.token_version,
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)
    set_refresh_cookie(response, refresh_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    refresh_cookie = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not refresh_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing. Please sign in.",
        )

    payload = decode_refresh_token(refresh_cookie)
    user_id_str = payload.get("sub")
    token_version = payload.get("token_version", 1)

    try:
        user_uuid = UUID(str(user_id_str))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject.",
        )

    stmt = select(User).where(User.id == user_uuid)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user is None or user.token_version != token_version or not user.is_active:
        response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please sign in again.",
        )

    new_payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "account_type": user.account_type,
        "token_version": user.token_version,
    }
    new_access_token = create_access_token(new_payload)
    new_refresh_token = create_refresh_token(new_payload)
    set_refresh_cookie(response, new_refresh_token)

    return TokenResponse(
        access_token=new_access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    response: Response,
    auth_payload: Dict[str, Any] = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    user_id_str = auth_payload.get("sub")
    if user_id_str:
        try:
            stmt = select(User).where(User.id == UUID(str(user_id_str)))
            user = (await db.execute(stmt)).scalar_one_or_none()
            if user is not None:
                user.token_version = (user.token_version or 1) + 1
                await db.commit()
        except Exception:
            await db.rollback()

    response.delete_cookie(key=settings.REFRESH_COOKIE_NAME, path="/")
    return {"message": "Successfully logged out. Session revoked."}


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    auth_payload: Dict[str, Any] = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    user_id_str = auth_payload.get("sub")
    token_version = auth_payload.get("token_version", 1)

    try:
        user_uuid = UUID(str(user_id_str))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier.",
        )

    stmt = select(User).where(User.id == user_uuid)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found.",
        )

    if not user.is_active or user.token_version != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked or deactivated. Please sign in again.",
        )

    # [Applying Skill: Pydantic V2]
    return UserProfileResponse.model_validate(user)
