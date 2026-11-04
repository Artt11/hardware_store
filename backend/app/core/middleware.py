import time
from collections import defaultdict
from typing import Dict, List, Tuple
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from fastapi import HTTPException, status
from app.core.config import settings

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    OWASP Top 10 fortified HTTP Security Headers Middleware.
    Enforces HSTS, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
    Referrer-Policy, and strict Permissions-Policy.
    """
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        
        # 1. HSTS (Strict-Transport-Security): Enforces HTTPS connections
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        # 2. X-Content-Type-Options: Prevents MIME-sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # 3. X-Frame-Options: Prevents clickjacking attacks
        response.headers["X-Frame-Options"] = "DENY"
        
        # 4. X-XSS-Protection: Legacy browser filter defense
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # 5. Referrer-Policy: Prevents sensitive path leakage in Referer headers
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # 6. Permissions-Policy: Restricts browser device sensors
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        
        # 7. Content-Security-Policy (CSP)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https://images.unsplash.com https://fastapi.tiangolo.com; "
            "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 http://localhost:5173; "
            "frame-ancestors 'none';"
        )
        return response

class RateLimiter:
    """
    Sliding Window Rate Limiter for Brute-Force & DDoS Mitigation.
    Tracks timestamps per client IP and endpoint to defend sensitive endpoints.
    """
    def __init__(self):
        # Maps (ip, endpoint) -> list of timestamp floats
        self._history: Dict[Tuple[str, str], List[float]] = defaultdict(list)

    def check_rate_limit(self, request: Request, endpoint_key: str, max_requests: int = 5, window_seconds: int = 60):
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        key = (client_ip, endpoint_key)
        
        # Filter timestamps outside the sliding window
        valid_timestamps = [t for t in self._history[key] if now - t < window_seconds]
        self._history[key] = valid_timestamps
        
        if len(valid_timestamps) >= max_requests:
            retry_after = int(window_seconds - (now - valid_timestamps[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Rate limit exceeded. Please retry in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)}
            )
        
        self._history[key].append(now)

rate_limiter = RateLimiter()
