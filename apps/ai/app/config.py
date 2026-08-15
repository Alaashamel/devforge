from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JOB_SECRET = "devforge-ai-shared-job-secret-change-me-1234567890"


class Settings(BaseSettings):
    """Environment configuration for the AI service (prefix: AI_)."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 5001
    log_level: str = "info"

    # Shared secret with the core API for signed job submission tokens.
    job_secret: str = DEFAULT_JOB_SECRET
    job_token_ttl_seconds: int = 300

    # Provider gateway (chat/completion).
    primary_provider: str = "local"
    fallback_provider: str = ""

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    anthropic_api_key: str = ""
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_model: str = "claude-3-5-haiku-latest"

    local_model_url: str = "http://localhost:11434/v1"
    local_model: str = ""

    # Embeddings + vector store.
    embedding_provider: str = "local"  # "local" (deterministic hash) or "openai"
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    database_url: str = "postgres://devforge:devforge@localhost:5433/devforge"

    # Ingestion limits.
    max_files: int = 2000
    max_file_bytes: int = 512 * 1024
    chunk_chars: int = 1500
    chunk_overlap_chars: int = 150
    context_token_budget: int = 6000


@lru_cache
def get_settings() -> Settings:
    return Settings()
