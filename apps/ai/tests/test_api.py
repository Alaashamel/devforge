"""Tests for the FastAPI service: health, auth-gated job submission."""

import time

import pytest
from fastapi.testclient import TestClient

from app.auth import sign_job_token
from app.config import Settings, get_settings
from app.deps import get_job_service
from app.main import create_app
from app.models.schemas import JobIntent, JobResult

SECRET = "test-secret"


class FakeJobService:
    def __init__(self) -> None:
        self.processed: list[JobIntent] = []

    def process(self, intent: JobIntent) -> JobResult:
        self.processed.append(intent)
        return JobResult(
            job_id=intent.job_id, status="succeeded", result={"ok": True}, model="fake"
        )


@pytest.fixture()
def client():
    app = create_app()
    fake = FakeJobService()
    app.dependency_overrides[get_settings] = lambda: Settings(job_secret=SECRET)
    app.dependency_overrides[get_job_service] = lambda: fake
    with TestClient(app) as test_client:
        test_client.fake_service = fake  # type: ignore[attr-defined]
        yield test_client


def _valid_token(job_id: str) -> str:
    now = int(time.time() * 1000)
    return sign_job_token(job_id, now + 60_000, SECRET)


def _intent(job_id: str, type_: str = "architecture") -> dict:
    return {
        "job_id": job_id,
        "type": type_,
        "organization_id": "org-1",
        "repository_id": "repo-1",
        "archive_url": "file:///dev/null.tar.gz",
        "archive_token": "t",
        "payload": {"repository_name": "demo"},
    }


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "devforge-ai"


def test_submit_job_requires_token(client):
    response = client.post("/jobs/job-1", json=_intent("job-1"))
    assert response.status_code == 401


def test_submit_job_rejects_invalid_token(client):
    token = _valid_token("job-1") + "tampered"
    response = client.post(
        "/jobs/job-1", json=_intent("job-1"), headers={"X-Devforge-Job-Token": token}
    )
    assert response.status_code == 401


def test_submit_job_rejects_wrong_job_id(client):
    token = _valid_token("job-1")
    response = client.post(
        "/jobs/job-2", json=_intent("job-1"), headers={"X-Devforge-Job-Token": token}
    )
    assert response.status_code == 401


def test_submit_job_accepts_valid_token(client):
    token = _valid_token("job-1")
    response = client.post(
        "/jobs/job-1", json=_intent("job-1"), headers={"X-Devforge-Job-Token": token}
    )
    assert response.status_code == 202
    body = response.json()
    assert body["job_id"] == "job-1"
    assert body["status"] == "accepted"


def test_submit_job_rejects_invalid_payload(client):
    token = _valid_token("job-1")
    response = client.post(
        "/jobs/job-1",
        json={"bad": "payload"},
        headers={"X-Devforge-Job-Token": token},
    )
    assert response.status_code == 422


def test_submit_job_dispatches_to_service(client):
    token = _valid_token("job-1")
    response = client.post(
        "/jobs/job-1", json=_intent("job-1"), headers={"X-Devforge-Job-Token": token}
    )
    assert response.status_code == 202
    processed = client.fake_service.processed  # type: ignore[attr-defined]
    assert len(processed) == 1
    assert processed[0].job_id == "job-1"
    assert processed[0].type == "architecture"
