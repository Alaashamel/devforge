"""Tests for the repository analyzer pipeline and report validation."""

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.pipelines.analysis import AnalysisError, AnalysisPipeline, validate_analyzer_report
from app.providers import CompletionError, CompletionRequest, CompletionResult
from app.providers.gateway import Gateway

_VALID_JSON = (
    '{"summary": "A demo codebase.", "dimensions": ['
    '  {"key": "architecture", "score": 80, "summary": "clean layers", '
    '   "strengths": ["modular"], "risks": ["no docs"], "recommendations": ["add docs"]},'
    '  {"key": "code_quality", "score": 70, "summary": "decent", '
    '   "strengths": [], "risks": [], "recommendations": []},'
    '  {"key": "security", "score": 90, "summary": "good", '
    '   "strengths": [], "risks": [], "recommendations": []},'
    '  {"key": "documentation", "score": 60, "summary": "sparse", '
    '   "strengths": [], "risks": [], "recommendations": ["write a README"]}'
    "]}"
)


def _report(data: dict) -> dict:
    report = {
        "summary": "A demo codebase.",
        "dimensions": [
            {"key": "architecture", "score": 80},
            {"key": "code_quality", "score": 70},
            {"key": "security", "score": 90},
            {"key": "documentation", "score": 60},
        ],
    }
    report.update(data)
    return report


def _gateway(text: str, fail: bool = False) -> Gateway:
    def complete(request: CompletionRequest) -> CompletionResult:
        if fail:
            raise CompletionError("provider down")
        return CompletionResult(text=text, model="fake-model")

    return Gateway(complete, None, "primary", "")


def _pipeline(text: str = _VALID_JSON, fail: bool = False) -> AnalysisPipeline:
    return AnalysisPipeline(Settings(job_secret="s"), _gateway(text, fail))


def test_validate_normalizes_and_computes_overall():
    result = validate_analyzer_report(_report({}))
    assert result["overall"] == 75
    assert [d["key"] for d in result["dimensions"]] == [
        "architecture",
        "code_quality",
        "security",
        "documentation",
    ]
    assert result["dimensions"][0]["label"] == "Architecture"


def test_validate_rejects_missing_dimension():
    dims = [
        {"key": "architecture", "score": 80},
        {"key": "code_quality", "score": 70},
        {"key": "security", "score": 90},
    ]
    with pytest.raises(ValueError, match="missing dimensions"):
        validate_analyzer_report(_report({"dimensions": dims}))


def test_validate_rejects_unknown_dimension():
    dims = [
        {"key": "architecture", "score": 80},
        {"key": "code_quality", "score": 70},
        {"key": "security", "score": 90},
        {"key": "documentation", "score": 60},
        {"key": "performance", "score": 50},
    ]
    with pytest.raises(ValueError, match="unknown dimensions"):
        validate_analyzer_report(_report({"dimensions": dims}))


def test_validate_rejects_out_of_range_score():
    dims = [
        {"key": "architecture", "score": 80},
        {"key": "code_quality", "score": 70},
        {"key": "security", "score": 90},
        {"key": "documentation", "score": 150},
    ]
    with pytest.raises(ValidationError):
        validate_analyzer_report(_report({"dimensions": dims}))


def test_analyzer_pipeline_returns_validated_report():
    pipeline = _pipeline()
    result, model = pipeline.run(type_="analyzer", snapshot={"repository_name": "demo"})
    assert result["overall"] == 75
    assert len(result["dimensions"]) == 4
    assert model == "fake-model"


def test_analyzer_pipeline_rejects_invalid_report():
    pipeline = _pipeline(
        '{"summary": "bad", "dimensions": [{"key": "architecture", "score": 80}]}'
    )
    with pytest.raises(AnalysisError, match="invalid analyzer report"):
        pipeline.run(type_="analyzer", snapshot={})
