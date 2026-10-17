"""
Proposal Assistant – Application Configuration
Uses Pydantic Settings for environment variable management.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # ─── Application ───────────────────────────────────
    APP_NAME: str = "Proposal Assistant"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # ─── Database ──────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://pa_user:pa_secret_dev@localhost:5432/proposal_assistant"

    # ─── Redis ─────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── MinIO / S3 ───────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minio_user"
    MINIO_SECRET_KEY: str = "minio_secret_dev"
    MINIO_BUCKET: str = "proposal-assistant"
    MINIO_USE_SSL: bool = False

    # ─── ONLYOFFICE ───────────────────────────────────
    ONLYOFFICE_URL: str = "http://localhost:8080"
    ONLYOFFICE_JWT_SECRET: str = "onlyoffice_jwt_secret_dev"
    CALLBACK_URL: str = "http://localhost:8000/api/editor/callback"
    API_BASE_URL: str = "http://localhost:8000"

    # ─── Auth ─────────────────────────────────────────
    JWT_SECRET: str = "app_jwt_secret_dev_change_in_prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── OpenRouter & Jev AI ─────────────────────────
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api"
    OPENROUTER_JEV_MODEL: str = "typesafe/jev-router"
    OPENROUTER_LLM_MODEL: str = "deepseek/deepseek-v4.1-flash-1017"
    OPENROUTER_SITE_URL: str = "http://localhost:3000"
    OPENROUTER_APP_NAME: str = "RFPilot"

    # ─── LLM / Embeddings ────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSION: int = 1024
    LLM_MODEL: str = "claude-sonnet-4-20250514"
    LLM_MAX_TOKENS: int = 2048

    # ─── RAG ──────────────────────────────────────────
    RAG_RETRIEVAL_K: int = 30
    RAG_RERANK_K: int = 6
    RAG_MIN_SCORE: float = 0.65
    CHUNK_SIZE_TOKENS: int = 400
    CHUNK_OVERLAP_TOKENS: int = 50

    # ─── Upload ───────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 25
    ALLOWED_FILE_TYPES: list[str] = ["xlsx", "docx", "pptx", "pdf", "txt"]

    model_config = {
        "env_file": (".env", "apps/api/.env", "../.env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
