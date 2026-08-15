"""Job submission endpoint with signed-token auth."""

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException

from ..auth import verify_job_token
from ..config import Settings, get_settings
from ..deps import get_job_service
from ..models.schemas import JobIntent, JobSubmissionResponse
from ..services.jobs import JobService

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _require_job_id(token: str, expected: str, settings: Settings) -> None:
    if not token:
        raise HTTPException(status_code=401, detail="missing job token")
    job_id = verify_job_token(token, settings.job_secret, settings.job_token_ttl_seconds)
    if job_id is None or job_id != expected:
        raise HTTPException(status_code=401, detail="invalid job token")


@router.post("/{job_id}", response_model=JobSubmissionResponse, status_code=202)
def submit_job(
    job_id: str,
    intent: JobIntent,
    background: BackgroundTasks,
    service: JobService = Depends(get_job_service),
    settings: Settings = Depends(get_settings),
    x_devforge_job_token: str | None = Header(default=None),
) -> JobSubmissionResponse:
    _require_job_id(x_devforge_job_token or "", job_id, settings)
    if intent.job_id != job_id:
        raise HTTPException(status_code=400, detail="job id mismatch")
    background.add_task(service.process, intent)
    return JobSubmissionResponse(job_id=job_id, status="accepted")
