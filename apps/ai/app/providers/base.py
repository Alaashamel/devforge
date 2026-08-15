"""Shared contracts for model invocation."""

from dataclasses import dataclass, field
from typing import Any


class CompletionError(Exception):
    """Raised when a provider fails or returns unusable output."""


class EmbeddingError(Exception):
    """Raised when an embedding provider fails."""


@dataclass
class CompletionRequest:
    """A bounded, model-agnostic completion request."""

    messages: list[dict[str, str]] = field(default_factory=list)
    system: str | None = None
    temperature: float = 0.2
    max_tokens: int = 1024
    json_mode: bool = False
    model: str | None = None


@dataclass
class CompletionResult:
    """A validated, structured completion result."""

    text: str
    model: str
    usage: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] | None = None


@dataclass
class EmbeddingResult:
    vectors: list[list[float]]
    model: str
    usage: dict[str, Any] = field(default_factory=dict)
