"""OpenAI-compatible chat completions and embeddings adapters."""

from typing import Any

import httpx

from .base import (
    CompletionError,
    CompletionRequest,
    CompletionResult,
    EmbeddingError,
    EmbeddingResult,
)


def _messages_payload(request: CompletionRequest, model: str) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
        "messages": request.messages,
    }
    if request.system:
        body["system"] = request.system
    if request.json_mode:
        body["response_format"] = {"type": "json_object"}
    return body


class OpenAIAdapter:
    """OpenAI chat completions via the /v1/chat/completions endpoint."""

    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.openai.com/v1",
        http: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=60.0)

    def complete(self, request: CompletionRequest) -> CompletionResult:
        try:
            response = self.http.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=_messages_payload(request, request.model or self.model),
            )
        except httpx.HTTPError as exc:
            raise CompletionError(f"openai request failed: {exc}") from exc
        if response.status_code >= 400:
            raise CompletionError(f"openai returned HTTP {response.status_code}")
        data = response.json()
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise CompletionError("openai response missing content") from exc
        if not isinstance(text, str):
            raise CompletionError("openai response content is not text")
        return CompletionResult(
            text=text,
            model=data.get("model", self.model),
            usage=data.get("usage", {}),
            raw=data,
        )


class OpenAIEmbeddingAdapter:
    """OpenAI embeddings via the /v1/embeddings endpoint."""

    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.openai.com/v1",
        http: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=60.0)

    def embed(self, texts: list[str]) -> EmbeddingResult:
        try:
            response = self.http.post(
                f"{self.base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": texts},
            )
        except httpx.HTTPError as exc:
            raise EmbeddingError(f"openai embeddings request failed: {exc}") from exc
        if response.status_code >= 400:
            raise EmbeddingError(f"openai embeddings returned HTTP {response.status_code}")
        data = response.json()
        try:
            vectors = [item["embedding"] for item in data["data"]]
        except (KeyError, TypeError) as exc:
            raise EmbeddingError("openai embeddings response missing data") from exc
        return EmbeddingResult(
            vectors=vectors,
            model=data.get("model", self.model),
            usage=data.get("usage", {}),
        )
