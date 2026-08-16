"""Tests for the docs/readme generation pipeline."""

import pytest

from app.config import Settings
from app.models.schemas import DocsReport
from app.pipelines.analysis import (
    AnalysisError,
    AnalysisPipeline,
    validate_docs_report,
)
from app.providers import CompletionRequest, CompletionResult
from app.providers.gateway import Gateway

_README_JSON = (
    '{"summary": "A demo", "files": [{"path": "README.md", "content": "# Demo\\n"}]}'
)
_DOCS_JSON = (
    '{"summary": "Docs generated", "files": ['
    '{"path": "docs/api.md", "content": "# Api\\n"},'
    '{"path": "docs/architecture.md", "content": "# Arch\\n"}'
    "]}"
)


def _gateway(text: str) -> Gateway:
    def complete(request: CompletionRequest) -> CompletionResult:
        return CompletionResult(text=text, model="fake-model")

    return Gateway(complete, None, "primary", "")


def _pipeline(text: str = _README_JSON) -> AnalysisPipeline:
    return AnalysisPipeline(Settings(job_secret="s"), _gateway(text))


def _normalize(files: list[dict]) -> list[dict]:
    return [
        {"path": f["path"], "content": f["content"], "note": f.get("note", "")}
        for f in files
    ]


def test_docs_report_schema_validates():
    report = DocsReport.model_validate(
        {"summary": "s", "files": [{"path": "docs/api.md", "content": "# Api\n"}]}
    )
    assert report.files[0].path == "docs/api.md"
    assert report.files[0].note == ""


def test_validate_readme_report_requires_readme_md():
    result = validate_docs_report(
        {"summary": "s", "files": [{"path": "README.md", "content": "# Demo\n"}]}, "readme"
    )
    assert result["files"] == [{"path": "README.md", "content": "# Demo\n", "note": ""}]


def test_validate_readme_rejects_other_paths():
    with pytest.raises(ValueError, match="exactly one file"):
        validate_docs_report(
            {
                "summary": "s",
                "files": [
                    {"path": "README.md", "content": "# Demo\n"},
                    {"path": "docs/api.md", "content": "# Api\n"},
                ],
            },
            "readme",
        )


def test_validate_docs_requires_docs_prefix():
    with pytest.raises(ValueError, match="under docs/"):
        validate_docs_report(
            {"summary": "s", "files": [{"path": "architecture.md", "content": "# A\n"}]},
            "docs",
        )


def test_validate_docs_sorts_deterministically():
    result = validate_docs_report(
        {
            "summary": "s",
            "files": [
                {"path": "docs/architecture.md", "content": "# Arch\n"},
                {"path": "docs/api.md", "content": "# Api\n"},
            ],
        },
        "docs",
    )
    assert [f["path"] for f in result["files"]] == ["docs/api.md", "docs/architecture.md"]


def test_validate_rejects_non_markdown():
    with pytest.raises(ValueError, match="not markdown"):
        validate_docs_report(
            {"summary": "s", "files": [{"path": "docs/notes.txt", "content": "plain"}]},
            "docs",
        )


def test_validate_rejects_escaping_paths():
    with pytest.raises(ValueError, match="repo-relative"):
        validate_docs_report(
            {"summary": "s", "files": [{"path": "docs/../../etc/passwd.md", "content": "x"}]},
            "docs",
        )


def test_validate_rejects_leading_slash_and_backslash():
    with pytest.raises(ValueError, match="forward slashes"):
        validate_docs_report(
            {"summary": "s", "files": [{"path": "docs\\api.md", "content": "x"}]},
            "docs",
        )


def test_validate_rejects_empty_file_list():
    with pytest.raises(ValueError, match="no files"):
        validate_docs_report({"summary": "s", "files": []}, "docs")


def test_readme_pipeline_returns_validated_report():
    pipeline = _pipeline(_README_JSON)
    result, model = pipeline.run(type_="readme", snapshot={"repository_name": "demo"})
    assert result["files"][0]["path"] == "README.md"
    assert model == "fake-model"


def test_docs_pipeline_returns_validated_report():
    pipeline = _pipeline(_DOCS_JSON)
    result, _ = pipeline.run(type_="docs", snapshot={"repository_name": "demo"})
    assert _normalize(result["files"]) == [
        {"path": "docs/api.md", "content": "# Api\n", "note": ""},
        {"path": "docs/architecture.md", "content": "# Arch\n", "note": ""},
    ]


def test_docs_pipeline_rejects_invalid_report():
    pipeline = _pipeline('{"summary": "s", "files": [{"path": "notes.txt", "content": "x"}]}')
    with pytest.raises(AnalysisError):
        pipeline.run(type_="docs", snapshot={})
