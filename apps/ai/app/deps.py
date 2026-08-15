"""FastAPI dependency singletons."""

from functools import lru_cache

from .config import get_settings
from .context.job_store import JobStore
from .context.vector_store import VectorStore
from .pipelines.analysis import AnalysisPipeline
from .pipelines.ingest import IngestionPipeline
from .providers import build_embedder, build_gateway
from .services.jobs import JobService


@lru_cache
def get_job_service() -> JobService:
    settings = get_settings()
    gateway = build_gateway(settings)
    embedder = build_embedder(settings)
    vector_store = VectorStore(settings.database_url)
    job_store = JobStore(settings.database_url)
    ingestion = IngestionPipeline(settings, embedder, vector_store)
    analysis = AnalysisPipeline(settings, gateway)
    return JobService(settings, job_store, ingestion, analysis)
