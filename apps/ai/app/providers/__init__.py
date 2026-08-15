"""Provider gateway: chat/completion adapters with primary + fallback."""

from .base import (
    CompletionError,
    CompletionRequest,
    CompletionResult,
    EmbeddingError,
)
from .embeddings import Embedder, build_embedder, hashing_embed
from .gateway import Gateway, build_gateway

__all__ = [
    "CompletionError",
    "CompletionRequest",
    "CompletionResult",
    "EmbeddingError",
    "Embedder",
    "Gateway",
    "build_embedder",
    "build_gateway",
    "hashing_embed",
]
