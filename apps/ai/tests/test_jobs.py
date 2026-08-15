"""Tests for the job orchestration service, including pull request reviews."""

from app.config import Settings
from app.models.schemas import JobIntent
from app.services.jobs import JobService


class FakeJobStore:
    def __init__(self) -> None:
        self.finished: list[dict] = []
        self.analyses: list[dict] = []

    def mark_running(self, job_id: str) -> None:
        pass

    def finish(
        self,
        job_id: str,
        *,
        result: dict | None = None,
        error: str | None = None,
        model: str | None = None,
    ) -> None:
        self.finished.append(
            {"job_id": job_id, "result": result, "error": error, "model": model}
        )

    def insert_analysis(self, **kwargs) -> None:
        self.analyses.append(kwargs)


class FakeAnalysis:
    def run(self, *, type_: str, snapshot: dict, context: str = "") -> tuple[dict, str]:
        assert type_ == "code_review"
        return (
            {
                "summary": "ok",
                "findings": [
                    {
                        "severity": "critical",
                        "file": "a.js",
                        "line": 1,
                        "title": "boom",
                    }
                ],
                "severity_counts": {"critical": 1},
            },
            "fake-model",
        )


def _intent(diff: str = "diff --git a/x b/x\n@@ -1 +1 @@\n+new\n") -> JobIntent:
    return JobIntent(
        job_id="job-1",
        type="code_review",
        organization_id="org-1",
        repository_id="repo-1",
        payload={
            "repository_name": "acme/repo",
            "pull_request_number": 7,
            "diff": diff,
        },
    )


def _service(store: FakeJobStore, analysis: FakeAnalysis) -> JobService:
    return JobService(Settings(job_secret="s"), store, None, analysis)


def test_code_review_job_writes_analysis_and_succeeds():
    store = FakeJobStore()
    service = _service(store, FakeAnalysis())
    result = service.process(_intent())

    assert result.status == "succeeded"
    assert result.result["severity_counts"] == {"critical": 1}
    assert result.result["score"]["score"] == 70
    assert result.result["pull_request_number"] == 7
    assert result.result["files_changed"] == 1

    analysis = store.analyses[0]
    assert analysis["type_"] == "code_review"
    assert analysis["organization_id"] == "org-1"
    assert analysis["repository_id"] == "repo-1"
    assert analysis["model"] == "fake-model"
    assert analysis["report"]["pull_request_number"] == 7
    assert analysis["score"]["score"] == 70

    finished = store.finished[0]
    assert finished["error"] is None
    assert finished["model"] == "fake-model"


def test_code_review_job_requires_a_diff():
    store = FakeJobStore()
    service = _service(store, FakeAnalysis())
    result = service.process(_intent(diff=""))

    assert result.status == "failed"
    assert "diff" in result.error
    assert store.analyses == []
