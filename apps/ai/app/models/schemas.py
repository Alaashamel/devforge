"""Pydantic input/output contracts for the AI service."""

from typing import Any

from pydantic import BaseModel, Field


class JobIntent(BaseModel):
    """A bounded job intent submitted by the core API."""

    job_id: str = Field(min_length=1, max_length=64)
    type: str = Field(min_length=1, max_length=60)
    organization_id: str | None = None
    project_id: str | None = None
    repository_id: str | None = None
    archive_url: str | None = None
    archive_token: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class JobSubmissionResponse(BaseModel):
    job_id: str
    status: str = "accepted"


class JobResult(BaseModel):
    job_id: str
    status: str
    result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    model: str | None = None


ANALYZER_DIMENSION_KEYS: tuple[str, ...] = (
    "architecture",
    "code_quality",
    "security",
    "documentation",
)


class AnalyzerDimension(BaseModel):
    """One scored dimension of a repository analysis."""

    key: str
    label: str = ""
    score: int = Field(ge=0, le=100)
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class AnalyzerReport(BaseModel):
    """Validated output of the repository analyzer job."""

    summary: str
    dimensions: list[AnalyzerDimension] = Field(default_factory=list)
