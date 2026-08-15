"""Anthropic Messages API adapter."""

from typing import Any

import httpx

from .base import CompletionError, CompletionRequest, CompletionResult


class AnthropicAdapter:
    """Anthropic via the /v1/messages endpoint."""

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.anthropic.com",
        http: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=60.0)

    def complete(self, request: CompletionRequest) -> CompletionResult:
        body: dict[str, Any] = {
            "model": request.model or self.model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "messages": request.messages,
        }
        if request.system:
            body["system"] = request.system
        try:
            response = self.http.post(
                f"{self.base_url}/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
        except httpx.HTTPError as exc:
            raise CompletionError(f"anthropic request failed: {exc}") from exc
        if response.status_code >= 400:
            raise CompletionError(f"anthropic returned HTTP {response.status_code}")
        data = response.json()
        try:
            text = "".join(
                block.get("text", "")
                for block in data.get("content", [])
                if block.get("type") == "text"
            )
        except (AttributeError, TypeError) as exc:
            raise CompletionError("anthropic response content is not text") from exc
        return CompletionResult(
            text=text,
            model=data.get("model", self.model),
            usage=data.get("usage", {}),
            raw=data,
        )
