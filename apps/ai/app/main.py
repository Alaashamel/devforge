"""DevForge AI service entrypoint."""

from fastapi import FastAPI

from .routers import assistant, health, jobs


def create_app() -> FastAPI:
    app = FastAPI(
        title="DevForge AI Service",
        version="0.1.0",
        description="Repository ingestion, analysis and retrieval for DevForge.",
    )
    app.include_router(health.router)
    app.include_router(jobs.router)
    app.include_router(assistant.router)
    return app


app = create_app()
