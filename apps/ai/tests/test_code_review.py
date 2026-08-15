"""Tests for the pull request code review pipeline and report validation."""

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.pipelines.analysis import (
    AnalysisError,
    AnalysisPipeline,
    validate_code_review_report,
)
from app.providers import CompletionError, CompletionRequest, CompletionResult
from app.providers.gateway import Gateway

_VALID_JSON = (
    '{"summary": "Solid diff with a couple of issues.", "findings": ['
    '  {"severity": "high", "file": "src/server.js", "line": 42, '
    '   "title": "Missing auth", "description": "Route is unauthenticated", '
    '   "suggestion": "Add the auth middleware"},'
    '  {"severity": "info", "file": "src/server.js", "line": 10, '
    '   "title": "Style", "description": "Trailing space", "suggestion": "Trim it"},'
    '  {"severity": "critical", "file": "src/db.js", "line": 3, '
    '   "title": "SQL injection", "description": "Query interpolates input", '
    '   "suggestion": "Use parameters"}'
    "]}"
)


def _gateway(text: str, fail: bool = False) -> Gateway:
    def complete(request: CompletionRequest) -> CompletionResult:
        if fail:
            raise CompletionError("provider down")
        return CompletionResult(text=text, model="fake-model")

    return Gateway(complete, None, "primary", "")


def _pipeline(text: str = _VALID_JSON, fail: bool = False) -> AnalysisPipeline:
    return AnalysisPipeline(Settings(job_secret="s"), _gateway(text, fail))


def test_validate_orders_findings_and_counts_severities():
    result = validate_code_review_report(
        {
            "summary": "ok",
            "findings": [
                {"severity": "info", "file": "b.js", "line": 1, "title": "nits"},
                {"severity": "critical", "file": "a.js", "line": 5, "title": "boom"},
                {"severity": "medium", "file": "a.js", "line": 2, "title": "meh"},
            ],
        }
    )
    assert [f["title"] for f in result["findings"]] == ["boom", "meh", "nits"]
    assert result["severity_counts"] == {"critical": 1, "medium": 1, "info": 1}


def test_validate_orders_same_severity_by_file_then_line():
    result = validate_code_review_report(
        {
            "summary": "ok",
            "findings": [
                {"severity": "high", "file": "b.js", "line": 9, "title": "two"},
                {"severity": "high", "file": "a.js", "line": 9, "title": "one"},
                {"severity": "high", "file": "a.js", "line": 2, "title": "zero"},
            ],
        }
    )
    assert [f["title"] for f in result["findings"]] == ["zero", "one", "two"]


def test_validate_rejects_unknown_severity():
    with pytest.raises(ValueError, match="unknown review severity"):
        validate_code_review_report(
            {
                "summary": "ok",
                "findings": [{"severity": "fatal", "file": "a.js", "title": "x"}],
            }
        )


def test_validate_rejects_missing_severity():
    with pytest.raises(ValidationError):
        validate_code_review_report(
            {"summary": "ok", "findings": [{"file": "a.js", "title": "x"}]}
        )


def test_validate_rejects_negative_line():
    with pytest.raises(ValidationError):
        validate_code_review_report(
            {"summary": "ok", "findings": [{"severity": "low", "line": -3}]}
        )


def test_code_review_pipeline_returns_validated_report():
    pipeline = _pipeline()
    result, model = pipeline.run(
        type_="code_review", snapshot={"repository_name": "demo"}, context="diff"
    )
    assert result["summary"] == "Solid diff with a couple of issues."
    assert result["findings"][0]["title"] == "SQL injection"
    assert result["severity_counts"] == {"critical": 1, "high": 1, "info": 1}
    assert model == "fake-model"


def test_code_review_pipeline_rejects_invalid_report():
    pipeline = _pipeline('{"summary": "bad", "findings": [{"severity": "fatal"}]}')
    with pytest.raises(AnalysisError, match="invalid code review report"):
        pipeline.run(type_="code_review", snapshot={}, context="diff")
