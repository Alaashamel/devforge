"""Tests for the provider gateway and OpenAI adapter."""

import json

import httpx
import pytest

from app.providers import CompletionError, CompletionRequest, CompletionResult
from app.providers.gateway import Gateway
from app.providers.openai import OpenAIAdapter


def _ok(*, text: str = "ok", model: str = "test"):
    def complete(request: CompletionRequest) -> CompletionResult:
        return CompletionResult(text=text, model=model)

    return complete


def _fail():
    def complete(request: CompletionRequest) -> CompletionResult:
        raise CompletionError("boom")

    return complete


def test_gateway_uses_primary_success():
    gateway = Gateway(_ok(text="primary"), _ok(text="fallback"), "p", "f")
    assert gateway.complete(CompletionRequest()).text == "primary"


def test_gateway_falls_back_on_primary_failure():
    gateway = Gateway(_fail(), _ok(text="fallback"), "p", "f")
    assert gateway.complete(CompletionRequest()).text == "fallback"


def test_gateway_raises_when_both_fail():
    gateway = Gateway(_fail(), _fail(), "p", "f")
    with pytest.raises(CompletionError):
        gateway.complete(CompletionRequest())


def test_gateway_raises_without_fallback():
    gateway = Gateway(_fail())
    with pytest.raises(CompletionError):
        gateway.complete(CompletionRequest())


def _adapter(payload: dict) -> OpenAIAdapter:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    return OpenAIAdapter(
        "test-key",
        "gpt-4o-mini",
        "https://api.openai.com/v1",
        http=httpx.Client(transport=transport),
    )


def test_openai_complete_parses_content():
    adapter = _adapter(
        {
            "choices": [{"message": {"content": "hi"}}],
            "model": "gpt-4o-mini",
            "usage": {"total_tokens": 5},
        }
    )
    result = adapter.complete(CompletionRequest())
    assert result.text == "hi"
    assert result.model == "gpt-4o-mini"
    assert result.usage["total_tokens"] == 5


def test_openai_complete_sends_system_and_json_mode():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.read())
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}], "model": "m"})

    transport = httpx.MockTransport(handler)
    adapter = OpenAIAdapter(
        "k", "m", "https://api.openai.com/v1", http=httpx.Client(transport=transport)
    )
    adapter.complete(
        CompletionRequest(
            messages=[{"role": "user", "content": "hi"}], system="sys", json_mode=True
        )
    )
    assert captured["body"]["system"] == "sys"
    assert captured["body"]["response_format"] == {"type": "json_object"}


def test_openai_complete_raises_on_error_status():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(401, json={"error": "unauthorized"})
    )
    adapter = OpenAIAdapter(
        "bad",
        "gpt-4o-mini",
        "https://api.openai.com/v1",
        http=httpx.Client(transport=transport),
    )
    with pytest.raises(CompletionError):
        adapter.complete(CompletionRequest())


def test_openai_complete_raises_when_content_missing():
    adapter = _adapter({"choices": []})
    with pytest.raises(CompletionError):
        adapter.complete(CompletionRequest())


def _stream_response(deltas: list[str]) -> httpx.Response:
    events = [json.dumps({"choices": [{"delta": {"content": d}}]}) for d in deltas]
    events.append("[DONE]")
    return httpx.Response(200, text="".join(f"data: {e}\n\n" for e in events))


def _stream_adapter() -> OpenAIAdapter:
    transport = httpx.MockTransport(lambda request: _stream_response(["hello", " world"]))
    return OpenAIAdapter(
        "test-key",
        "gpt-4o-mini",
        "https://api.openai.com/v1",
        http=httpx.Client(transport=transport),
    )


def test_openai_stream_yields_deltas():
    adapter = _stream_adapter()
    assert list(adapter.stream(CompletionRequest())) == ["hello", " world"]


def test_openai_stream_sets_stream_flag():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.read())
        return _stream_response(["ok"])

    transport = httpx.MockTransport(handler)
    adapter = OpenAIAdapter(
        "k", "m", "https://api.openai.com/v1", http=httpx.Client(transport=transport)
    )
    list(adapter.stream(CompletionRequest()))
    assert captured["body"]["stream"] is True


def test_openai_stream_raises_on_error_status():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(401, json={"error": "unauthorized"})
    )
    adapter = OpenAIAdapter(
        "bad", "gpt-4o-mini", "https://api.openai.com/v1", http=httpx.Client(transport=transport)
    )
    with pytest.raises(CompletionError):
        list(adapter.stream(CompletionRequest()))


def test_anthropic_stream_yields_deltas():
    from app.providers.anthropic import AnthropicAdapter

    events = [
        {"type": "content_block_delta", "delta": {"text": "hello"}},
        {"type": "content_block_delta", "delta": {"text": " world"}},
        {"type": "message_stop"},
    ]
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, text="".join(f"data: {json.dumps(e)}\n\n" for e in events)
        )
    )
    adapter = AnthropicAdapter(
        "test-key",
        "claude-haiku",
        "https://api.anthropic.com",
        http=httpx.Client(transport=transport),
    )
    assert list(adapter.stream(CompletionRequest())) == ["hello", " world"]


def test_local_stream_yields_deltas():
    from app.providers.local import LocalAdapter

    transport = httpx.MockTransport(lambda request: _stream_response(["bye"]))
    adapter = LocalAdapter(
        "http://localhost:11434/v1", "llama3", http=httpx.Client(transport=transport)
    )
    assert list(adapter.stream(CompletionRequest())) == ["bye"]


def test_gateway_stream_uses_primary():
    def primary_stream(request):
        yield "a"
        yield "b"

    gateway = Gateway(
        _ok(),
        _ok(),
        "p",
        "f",
        primary_stream=primary_stream,
        fallback_stream=(lambda request: (x for x in ["x"])),
    )
    assert list(gateway.stream(CompletionRequest())) == ["a", "b"]


def test_gateway_stream_falls_back_on_primary_error():
    def failing_stream(request):
        raise CompletionError("boom")
        yield

    def fallback_stream(request):
        yield "recovered"

    gateway = Gateway(
        _ok(), _ok(), "p", "f", primary_stream=failing_stream, fallback_stream=fallback_stream
    )
    assert list(gateway.stream(CompletionRequest())) == ["recovered"]


def test_gateway_stream_raises_without_stream_capability():
    gateway = Gateway(_ok(), _ok(), "p", "f")
    with pytest.raises(CompletionError):
        list(gateway.stream(CompletionRequest()))


def test_gateway_stream_raises_when_both_fail():
    def failing_stream(request):
        raise CompletionError("boom")
        yield

    gateway = Gateway(
        _ok(), _ok(), "p", "f", primary_stream=failing_stream, fallback_stream=failing_stream
    )
    with pytest.raises(CompletionError):
        list(gateway.stream(CompletionRequest()))


def test_gateway_stream_raises_without_fallback():
    def failing_stream(request):
        raise CompletionError("boom")
        yield

    gateway = Gateway(_ok(), _ok(), "p", "f", primary_stream=failing_stream)
    with pytest.raises(CompletionError):
        list(gateway.stream(CompletionRequest()))
