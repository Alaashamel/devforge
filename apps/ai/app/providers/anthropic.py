"""Anthropic Messages API adapter."""

import json
from collections.abc import Iterator
from typing import Any

import httpx

from .base import CompletionError, CompletionRequest, CompletionResult


def iter_anthropic_deltas(response) -> Iterator[str]:
    """Yield text deltas from an Anthropic SSE stream."""
    for line in response.iter_lines():
        if not line or not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if not payload:
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "content_block_delta":
            delta = (event.get("delta") or {}).get("text")
            if delta:
                yield delta
        elif event.get("type") == "message_stop":
            break


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

    def stream(self, request: CompletionRequest) -> Iterator[str]:
        body: dict[str, Any] = {
            "model": request.model or self.model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "messages": request.messages,
            "stream": True,
        }
        if request.system:
            body["system"] = request.system
        try:
            with self.http.stream(
                "POST",
                f"{self.base_url}/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            ) as response:
                if response.status_code >= 400:
                    raise CompletionError(f"anthropic returned HTTP {response.status_code}")
                yield from iter_anthropic_deltas(response)
        except httpx.HTTPError as exc:
            raise CompletionError(f"anthropic stream failed: {exc}") from exc
