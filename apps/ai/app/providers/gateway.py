"""Provider selection and fallback."""

from collections.abc import Callable, Iterator

from .anthropic import AnthropicAdapter
from .base import CompletionError, CompletionRequest, CompletionResult
from .local import LocalAdapter
from .openai import OpenAIAdapter


class Gateway:
    """A completion gateway that tries a primary provider and falls back."""

    def __init__(
        self,
        primary: Callable[[CompletionRequest], CompletionResult],
        fallback: Callable[[CompletionRequest], CompletionResult] | None = None,
        primary_name: str = "",
        fallback_name: str = "",
        primary_stream: Callable[[CompletionRequest], Iterator[str]] | None = None,
        fallback_stream: Callable[[CompletionRequest], Iterator[str]] | None = None,
    ) -> None:
        self.primary = primary
        self.fallback = fallback
        self.primary_name = primary_name
        self.fallback_name = fallback_name
        self.primary_stream = primary_stream
        self.fallback_stream = fallback_stream

    def complete(self, request: CompletionRequest) -> CompletionResult:
        try:
            return self.primary(request)
        except CompletionError:
            if self.fallback is None:
                raise
            try:
                return self.fallback(request)
            except CompletionError as exc:
                raise CompletionError(
                    f"primary ({self.primary_name}) and fallback ({self.fallback_name}) both failed"
                ) from exc

    def stream(self, request: CompletionRequest) -> Iterator[str]:
        """Stream deltas from the primary provider, falling back if it fails
        before producing any output."""
        if self.primary_stream is None:
            raise CompletionError(f"primary provider ({self.primary_name}) cannot stream")
        try:
            yield from self.primary_stream(request)
        except CompletionError:
            if self.fallback_stream is None:
                raise
            try:
                yield from self.fallback_stream(request)
            except CompletionError as exc:
                raise CompletionError(
                    f"primary ({self.primary_name}) and fallback ({self.fallback_name}) both failed"
                ) from exc


def _adapter_for(name: str, settings):
    """Build the adapter selected by configuration."""
    if name == "openai":
        if not settings.openai_api_key:
            raise CompletionError("openai provider selected but AI_OPENAI_API_KEY is not set")
        return OpenAIAdapter(
            settings.openai_api_key, settings.openai_model, settings.openai_base_url
        )
    if name == "anthropic":
        if not settings.anthropic_api_key:
            raise CompletionError("anthropic provider selected but AI_ANTHROPIC_API_KEY is not set")
        return AnthropicAdapter(
            settings.anthropic_api_key,
            settings.anthropic_model,
            settings.anthropic_base_url,
        )
    if name == "local":
        return LocalAdapter(settings.local_model_url, settings.local_model)
    raise CompletionError(f"unknown provider: {name}")


def build_gateway(settings) -> Gateway:
    primary = _adapter_for(settings.primary_provider, settings)
    fallback = None
    fallback_name = ""
    if settings.fallback_provider:
        fallback = _adapter_for(settings.fallback_provider, settings)
        fallback_name = settings.fallback_provider
    return Gateway(
        primary.complete,
        fallback.complete if fallback else None,
        settings.primary_provider,
        fallback_name,
        primary_stream=primary.stream,
        fallback_stream=fallback.stream if fallback else None,
    )
