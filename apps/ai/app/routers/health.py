"""Health endpoint."""

from fastapi import APIRouter

from ..config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "service": "devforge-ai",
        "version": "0.1.0",
        "primary_provider": settings.primary_provider,
        "embedding_provider": settings.embedding_provider,
    }
