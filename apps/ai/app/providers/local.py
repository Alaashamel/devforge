"""Local model adapter (Ollama-compatible OpenAI endpoint)."""

from typing import Any

import httpx

from .base import CompletionError, CompletionRequest, CompletionResult


class LocalAdapter:
    """Calls a local OpenAI-compatible endpoint (e.g. Ollama) without auth."""

    name = "local"

    def __init__(
        self,
        base_url: str,
        model: str = "",
        http: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.http = http or httpx.Client(timeout=120.0)

    def complete(self, request: CompletionRequest) -> CompletionResult:
        if not self.base_url:
            raise CompletionError("no local model endpoint configured (AI_LOCAL_MODEL_URL)")
        body: dict[str, Any] = {
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "messages": request.messages,
        }
        model = request.model or self.model
        if model:
            body["model"] = model
        if request.system:
            body["messages"] = [{"role": "system", "content": request.system}, *request.messages]
        try:
            response = self.http.post(f"{self.base_url}/chat/completions", json=body)
        except httpx.HTTPError as exc:
            raise CompletionError(f"local model request failed: {exc}") from exc
        if response.status_code >= 400:
            raise CompletionError(f"local model returned HTTP {response.status_code}")
        data = response.json()
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise CompletionError("local model response missing content") from exc
        return CompletionResult(
            text=text,
            model=data.get("model", model),
            usage=data.get("usage", {}),
            raw=data,
        )
