from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from typing import Dict, Any
from uuid import UUID, uuid4
from datetime import datetime, timezone

from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user_payload
)
from app.core.middleware import rate_limiter
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserProfileResponse
)

router = APIRouter(prefix="/auth", tags=["Authentication & Security"])

# In-memory user store for rapid enterprise testing and demonstration
# In production with DB, backed by PostgreSQL `users` table
_USERS_DB: Dict[str, Dict[str, Any]] = {
    "admin@auratools.com": {
        "id": UUID("11111111-2222-3333-4444-555555555555"),
        "email": "admin@auratools.com",
        "password_hash": hash_password("AdminSecure2026!"),
        "account_type": "individual",
        "first_name": "Alexander",
        "last_name": "Vance",
        "company_name": None,
        "tax_id": None,
        "contact_person": None,
        "phone": "+1 (555) 019-2831",
        "token_version": 1,
        "role": "admin",
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    },
    "contractor@buildcorp.com": {
        "id": UUID("22222222-3333-4444-5555-666666666666"),
        "email": "contractor@buildcorp.com",
        "password_hash": hash_password("BuildCorpSecure#1"),
        "account_type": "company",
        "first_name": None,
        "last_name": None,
        "company_name": "Apex Construction Corp",
        "tax_id": "US-EIN-94-2849104",
        "contact_person": "Marcus Brody",
        "phone": "+1 (555) 482-9011",
        "token_version": 1,
        "role": "customer",
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    }
}

def set_refresh_cookie(response: Response, refresh_token: str):
    """
    Sets the refresh token exclusively into an HttpOnly, Secure, SameSite cookie.
    This categorically eliminates the risk of JavaScript/XSS stealing the session.
    """
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=settings.COOKIE_HTTPONLY,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/"
    )

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, response: Response):
    """
    Dual Registration endpoint supporting B2C Individuals and B2B Companies.
    Enforces brute-force rate limiting, password hashing with bcrypt, and sets HttpOnly refresh cookie.
    """
    # 1. Rate Limiting Protection
    rate_limiter.check_rate_limit(request, "register", max_requests=settings.RATE_LIMIT_REGISTER_MAX, window_seconds=60)
    
    clean_email = payload.email.lower().strip()
    if clean_email in _USERS_DB:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists."
        )

    # 2. Secure Bcrypt Password Hashing
    user_id = uuid4()
    user_record = {
        "id": user_id,
        "email": clean_email,
        "password_hash": hash_password(payload.password),
        "account_type": payload.account_type,
        "first_name": payload.first_name,
        "last_name": payload.last_name,
        "company_name": payload.company_name,
        "tax_id": payload.tax_id,
        "contact_person": payload.contact_person,
        "phone": payload.phone,
        "token_version": 1,
        "role": "customer",
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    }
    _USERS_DB[clean_email] = user_record

    # 3. Issue in-memory Access Token & HttpOnly Refresh Token
    token_payload = {
        "sub": str(user_id),
        "email": clean_email,
        "role": "customer",
        "account_type": payload.account_type,
        "token_version": 1
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)
    
    set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, response: Response):
    """
    Authenticates user, sets HttpOnly refresh cookie, and returns short-lived access token in memory.
    Protected by strict sliding-window rate limiting.
    """
    # 1. Rate Limiting Protection
    rate_limiter.check_rate_limit(request, "login", max_requests=settings.RATE_LIMIT_LOGIN_MAX, window_seconds=60)

    clean_email = payload.email.lower().strip()
    user = _USERS_DB.get(clean_email)
    
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password combination."
        )

    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated.")

    # 2. Generate tokens
    token_payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "account_type": user["account_type"],
        "token_version": user["token_version"]
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)

    # 3. Store refresh token exclusively in HttpOnly cookie
    set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(request: Request, response: Response):
    """
    Silent token refresh: reads HttpOnly cookie, verifies signature & token version,
    and returns a fresh short-lived in-memory Access Token.
    """
    refresh_cookie = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not refresh_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing. Please sign in."
        )

    payload = decode_refresh_token(refresh_cookie)
    user_id = payload.get("sub")
    token_version = payload.get("token_version", 1)

    # Find user in store to check token revocation
    user = next((u for u in _USERS_DB.values() if str(u["id"]) == user_id), None)
    if not user or user["token_version"] != token_version:
        response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please sign in again."
        )

    # Issue fresh Access Token and rotate Refresh Token
    new_payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "account_type": user["account_type"],
        "token_version": user["token_version"]
    }
    new_access_token = create_access_token(new_payload)
    new_refresh_token = create_refresh_token(new_payload)
    set_refresh_cookie(response, new_refresh_token)

    return TokenResponse(access_token=new_access_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(response: Response, auth_payload: Dict[str, Any] = Depends(get_current_user_payload)):
    """
    Secure logout: clears HttpOnly refresh cookie and revokes all active session tokens
    by incrementing user's token_version.
    """
    user_id = auth_payload.get("sub")
    user = next((u for u in _USERS_DB.values() if str(u["id"]) == user_id), None)
    if user:
        user["token_version"] += 1 # Invalidate all current tokens

    response.delete_cookie(key=settings.REFRESH_COOKIE_NAME, path="/")
    return {"message": "Successfully logged out. Session revoked."}

@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(auth_payload: Dict[str, Any] = Depends(get_current_user_payload)):
    """
    Protected user profile endpoint: returns authenticated user data.
    """
    user_id = auth_payload.get("sub")
    user = next((u for u in _USERS_DB.values() if str(u["id"]) == user_id), None)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found.")
    return UserProfileResponse.from_orm(user) if hasattr(UserProfileResponse, "from_orm") else UserProfileResponse(**user)
