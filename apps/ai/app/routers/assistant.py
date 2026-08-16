"""Streamed assistant endpoint with signed-token auth.

The core API persists conversations and relays SSE events from here; the AI
service stays stateless and only ever reads repository-indexed content scoped
to the requested repository.
"""

import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse

from ..auth import verify_job_token
from ..config import Settings, get_settings
from ..deps import get_assistant_pipeline
from ..models.schemas import AssistantRequest
from ..pipelines.assistant import AssistantError, AssistantPipeline

router = APIRouter(prefix="/assistant", tags=["assistant"])

_ANONYMOUS_JOB_ID = "assistant"


def _require_job_token(token: str, settings: Settings) -> None:
    if not token:
        raise HTTPException(status_code=401, detail="missing job token")
    job_id = verify_job_token(token, settings.job_secret, settings.job_token_ttl_seconds)
    if job_id is None or job_id != _ANONYMOUS_JOB_ID:
        raise HTTPException(status_code=401, detail="invalid job token")


def _event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _stream(
    pipeline: AssistantPipeline, request: AssistantRequest
) -> Iterator[str]:
    query = request.messages[-1].content
    try:
        sources = pipeline.retrieve(
            organization_id=request.organization_id,
            repository_id=request.repository_id,
            query=query,
        )
    except Exception:
        sources = []
    yield _event({"type": "sources", "sources": sources})
    try:
        for delta in pipeline.stream_reply(
            repository_name=request.repository_name,
            messages=[message.model_dump() for message in request.messages],
            sources=sources,
        ):
            yield _event({"type": "delta", "text": delta})
        yield _event({"type": "done"})
    except AssistantError as exc:
        yield _event({"type": "error", "message": str(exc)})


@router.post("/stream")
def stream_assistant(
    request: AssistantRequest,
    pipeline: AssistantPipeline = Depends(get_assistant_pipeline),
    settings: Settings = Depends(get_settings),
    x_devforge_job_token: str | None = Header(default=None),
) -> StreamingResponse:
    _require_job_token(x_devforge_job_token or "", settings)
    return StreamingResponse(
        _stream(pipeline, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
