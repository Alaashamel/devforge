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
