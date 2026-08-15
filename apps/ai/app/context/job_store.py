"""Persistence for ai_jobs and ai_analyses."""

import psycopg
from psycopg.types.json import Jsonb


class JobStore:
    """Updates job lifecycle and analysis rows on the shared database."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url)

    def mark_running(self, job_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE ai_jobs SET status = 'running', attempts = attempts + 1, "
                "updated_at = now() WHERE id = %s",
                (job_id,),
            )

    def finish(
        self,
        job_id: str,
        *,
        result: dict | None = None,
        error: str | None = None,
        model: str | None = None,
    ) -> None:
        status = "succeeded" if error is None else "failed"
        with self._connect() as conn:
            conn.execute(
                "UPDATE ai_jobs SET status = %s, result = %s, error = %s, model = %s, "
                "updated_at = now() WHERE id = %s",
                (status, Jsonb(result or {}), error, model, job_id),
            )

    def insert_analysis(
        self,
        *,
        organization_id: str,
        repository_id: str | None,
        type_: str,
        model: str | None,
        score: dict,
        report: dict,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ai_analyses
                  (organization_id, repository_id, type, status, model, score, report)
                VALUES (%s, %s, %s, 'completed', %s, %s, %s)
                """,
                (organization_id, repository_id, type_, model, Jsonb(score), Jsonb(report)),
            )
