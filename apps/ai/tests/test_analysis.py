"""Tests for the analysis pipeline."""

import pytest

from app.config import Settings
from app.pipelines.analysis import AnalysisError, AnalysisPipeline, parse_json_output
from app.providers import CompletionError, CompletionRequest, CompletionResult
from app.providers.gateway import Gateway

_ARCHITECTURE_JSON = (
    '{"summary": "ok", '
    '"architecture": {"layers": ["api"], "patterns": ["factory"], "data_flow": "n/a"}, '
    '"strengths": [], "risks": [], "recommendations": []}'
)


def _gateway(text: str, fail: bool = False) -> Gateway:
    def complete(request: CompletionRequest) -> CompletionResult:
        if fail:
            raise CompletionError("provider down")
        return CompletionResult(text=text, model="fake-model")

    return Gateway(complete, None, "primary", "")


def _pipeline(text: str = _ARCHITECTURE_JSON, fail: bool = False) -> AnalysisPipeline:
    return AnalysisPipeline(Settings(job_secret="s"), _gateway(text, fail))


def test_architecture_pipeline_returns_parsed_json():
    pipeline = _pipeline()
    result, model = pipeline.run(type_="architecture", snapshot={"repository_name": "demo"})
    assert result["summary"] == "ok"
    assert result["architecture"]["patterns"] == ["factory"]
    assert model == "fake-model"


def test_readme_pipeline_passes_markdown_through():
    pipeline = _pipeline('{"readme": "# Demo\\n", "summary": "A demo"}')
    result, _ = pipeline.run(type_="readme", snapshot={})
    assert result["readme"] == "# Demo\n"


def test_analysis_raises_on_malformed_json():
    pipeline = _pipeline("this is not json")
    with pytest.raises(AnalysisError):
        pipeline.run(type_="architecture", snapshot={})


def test_analysis_raises_on_non_object_json():
    pipeline = _pipeline("[1, 2, 3]")
    with pytest.raises(AnalysisError):
        pipeline.run(type_="architecture", snapshot={})


def test_analysis_raises_on_provider_failure():
    pipeline = _pipeline(fail=True)
    with pytest.raises(AnalysisError):
        pipeline.run(type_="architecture", snapshot={})


def test_analysis_rejects_unknown_type():
    pipeline = _pipeline()
    with pytest.raises(AnalysisError):
        pipeline.run(type_="nonsense", snapshot={})


def test_parse_json_output_strips_fences():
    assert parse_json_output('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_output('```\n{"b": 2}\n```') == {"b": 2}
    assert parse_json_output('{"c": 3}') == {"c": 3}
