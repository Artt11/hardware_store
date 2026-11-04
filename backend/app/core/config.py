from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "AuraTools Enterprise E-Commerce API"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/hardware_store"
    
    # Elasticsearch
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX: str = "hardware_products"
    
    # Redis Cache & Sessions
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Advanced JWT & Session Security
    JWT_SECRET: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    JWT_REFRESH_SECRET: str = "d4e28fa0b92451f28b284e3658f28c5a4d49e6f3d179652a9f140645c36394e1"
    JWT_ALGORITHM: str = "HS256"
    
    # Short-lived Access Token (15 minutes in memory)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    # Long-lived Refresh Token (7 days in HttpOnly cookie)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Cookie security policy
    REFRESH_COOKIE_NAME: str = "auratools_refresh_token"
    COOKIE_HTTPONLY: bool = True
    COOKIE_SECURE: bool = False # Set True in production over HTTPS
    COOKIE_SAMESITE: str = "lax" # "strict" or "lax" for local cross-port dev
    
    # Rate Limiting configuration
    RATE_LIMIT_LOGIN_MAX: int = 5 # 5 attempts per window
    RATE_LIMIT_REGISTER_MAX: int = 5
    RATE_LIMIT_WINDOW_SECONDS: int = 60 # 1 minute window
    
    # Strict CORS configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:4173"
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
