"""Tests for the assistant pipeline and streamed endpoint."""

import json
import time

import pytest
from fastapi.testclient import TestClient

from app.auth import sign_job_token
from app.config import Settings, get_settings
from app.deps import get_assistant_pipeline
from app.main import create_app
from app.pipelines.assistant import AssistantError, AssistantPipeline
from app.providers import CompletionError

SECRET = "test-secret"


class FakeEmbedder:
    def __init__(self, vectors=None, error: Exception | None = None) -> None:
        self.vectors = vectors or [[0.1] * 8]
        self.error = error

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self.error:
            raise self.error
        return self.vectors[: len(texts)]


class FakeVectorStore:
    def __init__(self, vector=None, keyword=None) -> None:
        self.vector = vector or []
        self.keyword = keyword or []
        self.last_query = ""

    def vector_search(self, organization_id, repository_id, embedding, limit=8):
        return self.vector

    def keyword_search(self, organization_id, repository_id, query, limit=8):
        self.last_query = query
        return self.keyword


class FakeGateway:
    def __init__(self, deltas=None, error: Exception | None = None) -> None:
        self.deltas = deltas or []
        self.error = error
        self.last_request = None

    def stream(self, request):
        self.last_request = request
        if self.error:
            raise self.error
        yield from self.deltas


def _pipeline(gateway: FakeGateway, vector_store=None, embedder=None) -> AssistantPipeline:
    return AssistantPipeline(
        Settings(context_token_budget=4000),
        gateway,
        embedder or FakeEmbedder(),
        vector_store or FakeVectorStore(),
    )


def test_retrieve_combines_vector_and_keyword_hits():
    store = FakeVectorStore(
        vector=[{"path": "a.py", "language": "Python", "content": "def run(): pass", "score": 0.9}],
        keyword=[
            {"path": "docs.md", "language": "Markdown", "content": "How to run", "score": 0.4}
        ],
    )
    pipeline = _pipeline(FakeGateway(), vector_store=store)
    sources = pipeline.retrieve(
        organization_id="org-1", repository_id="repo-1", query="how do I run this"
    )
    assert [s["path"] for s in sources] == ["a.py", "docs.md"]
    assert store.last_query == "how do I run this"


def test_retrieve_falls_back_to_keyword_when_embedding_fails():
    store = FakeVectorStore(
        keyword=[{"path": "docs.md", "language": "Markdown", "content": "How to run", "score": 0.4}]
    )
    pipeline = _pipeline(
        FakeGateway(),
        vector_store=store,
        embedder=FakeEmbedder(error=RuntimeError("offline")),
    )
    sources = pipeline.retrieve(organization_id="org-1", repository_id="repo-1", query="run")
    assert [s["path"] for s in sources] == ["docs.md"]


def test_retrieve_empty_without_results():
    pipeline = _pipeline(FakeGateway(), vector_store=FakeVectorStore())
    sources = pipeline.retrieve(organization_id="org-1", repository_id="repo-1", query="nothing")
    assert sources == []


def test_stream_reply_builds_insulated_prompt_and_streams_deltas():
    gateway = FakeGateway(deltas=["hello", " world"])
    pipeline = _pipeline(gateway)
    sources = [{"path": "README.md", "language": "Markdown", "content": "docs", "score": 1.0}]
    history = [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "reply"},
    ]
    deltas = list(
        pipeline.stream_reply(repository_name="demo", messages=history, sources=sources)
    )
    assert deltas == ["hello", " world"]
    request = gateway.last_request
    assert "demo" in request.system
    assert "<untrusted>" in request.system
    assert "README.md" in request.system
    assert request.messages == history
    assert request.temperature == 0.3
    assert request.max_tokens == 1200


def test_stream_reply_truncates_history():
    gateway = FakeGateway(deltas=["ok"])
    pipeline = _pipeline(gateway)
    history = [{"role": "user", "content": f"msg {i}"} for i in range(25)]
    list(pipeline.stream_reply(repository_name="demo", messages=history, sources=[]))
    assert len(gateway.last_request.messages) == 20


def test_stream_reply_wraps_completion_errors():
    gateway = FakeGateway(error=CompletionError("down"))
    pipeline = _pipeline(gateway)
    with pytest.raises(AssistantError):
        list(
            pipeline.stream_reply(
                repository_name="demo",
                messages=[{"role": "user", "content": "hi"}],
                sources=[],
            )
        )


class FakeAssistantPipeline:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.sources = [
            {"path": "README.md", "language": "Markdown", "content": "docs", "score": 1.0}
        ]

    def retrieve(self, *, organization_id, repository_id, query):
        return self.sources

    def stream_reply(self, *, repository_name, messages, sources):
        if self.error:
            raise self.error
        yield from ["par", "tial"]


@pytest.fixture()
def client():
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(job_secret=SECRET)
    app.dependency_overrides[get_assistant_pipeline] = lambda: FakeAssistantPipeline()
    with TestClient(app) as test_client:
        yield test_client


def _token() -> str:
    now = int(time.time() * 1000)
    return sign_job_token("assistant", now + 60_000, SECRET)


def _body() -> dict:
    return {
        "conversation_id": "conv-1",
        "organization_id": "org-1",
        "repository_id": "repo-1",
        "repository_name": "demo",
        "messages": [{"role": "user", "content": "what is this?"}],
    }


def _events(response) -> list[dict]:
    events = []
    for chunk in response.text.split("\n\n"):
        if not chunk.startswith("data: "):
            continue
        events.append(json.loads(chunk[len("data: "):]))
    return events


def test_stream_requires_token(client):
    response = client.post("/assistant/stream", json=_body())
    assert response.status_code == 401


def test_stream_rejects_invalid_token(client):
    response = client.post(
        "/assistant/stream", json=_body(), headers={"X-Devforge-Job-Token": _token() + "x"}
    )
    assert response.status_code == 401


def test_stream_emits_sources_then_deltas_then_done(client):
    response = client.post(
        "/assistant/stream", json=_body(), headers={"X-Devforge-Job-Token": _token()}
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    events = _events(response)
    assert [e["type"] for e in events] == ["sources", "delta", "delta", "done"]
    assert events[0]["sources"][0]["path"] == "README.md"
    assert events[1]["text"] == "par"
    assert events[2]["text"] == "tial"


def test_stream_emits_error_event_when_model_fails(client):
    app = client.app
    app.dependency_overrides[get_assistant_pipeline] = lambda: FakeAssistantPipeline(
        error=AssistantError("model stream failed: boom")
    )
    response = client.post(
        "/assistant/stream", json=_body(), headers={"X-Devforge-Job-Token": _token()}
    )
    events = _events(response)
    assert events[-1]["type"] == "error"
    assert "boom" in events[-1]["message"]


def test_stream_rejects_invalid_payload(client):
    response = client.post(
        "/assistant/stream", json={"bad": "payload"}, headers={"X-Devforge-Job-Token": _token()}
    )
    assert response.status_code == 422
