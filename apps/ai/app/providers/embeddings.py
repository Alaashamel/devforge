"""Embedding facade: deterministic local hashing (offline) or OpenAI."""

import hashlib
import math

from .base import EmbeddingError
from .openai import OpenAIEmbeddingAdapter


def hashing_embed(texts: list[str], dim: int = 1536) -> list[list[float]]:
    """Deterministic, credential-free embeddings for offline development.

    Each dimension is a stable hash of (text, index), normalized to a unit
    vector so cosine similarity is meaningful.
    """
    vectors: list[list[float]] = []
    for text in texts:
        vec = [0.0] * dim
        for i in range(dim):
            digest = hashlib.sha256(f"{text}\x1f{i}".encode()).digest()
            vec[i] = digest[0] / 255.0 - 0.5
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        vectors.append([v / norm for v in vec])
    return vectors


class Embedder:
    """Embeds text into fixed-dimension vectors."""

    def __init__(self, impl, dim: int = 1536, model: str = "") -> None:
        self.impl = impl
        self.dim = dim
        self.model = model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if isinstance(self.impl, str) and self.impl == "local":
            return hashing_embed(texts, self.dim)
        result = self.impl.embed(texts)
        for vector in result.vectors:
            if len(vector) != self.dim:
                raise EmbeddingError(f"embedding dimension {len(vector)} does not match {self.dim}")
        return result.vectors


def build_embedder(settings) -> Embedder:
    if settings.embedding_provider == "openai":
        if not settings.openai_api_key:
            raise EmbeddingError("openai embeddings selected but AI_OPENAI_API_KEY is not set")
        impl = OpenAIEmbeddingAdapter(
            settings.openai_api_key, settings.embedding_model, settings.openai_base_url
        )
        return Embedder(impl, settings.embedding_dim, settings.embedding_model)
    return Embedder("local", settings.embedding_dim, "local-hash")
