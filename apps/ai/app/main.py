"""DevForge AI service entrypoint."""

from fastapi import FastAPI

from .routers import health, jobs


def create_app() -> FastAPI:
    app = FastAPI(
        title="DevForge AI Service",
        version="0.1.0",
        description="Repository ingestion, analysis and retrieval for DevForge.",
    )
    app.include_router(health.router)
    app.include_router(jobs.router)
    return app


app = create_app()
