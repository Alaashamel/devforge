"""Job orchestration service."""

from ..config import Settings
from ..context.job_store import JobStore
from ..context.retrieval import assemble_context, render_context
from ..ingestion.chunk import chunk_text
from ..ingestion.snapshot import RepositorySnapshot
from ..models.schemas import JobIntent, JobResult
from ..pipelines.analysis import AnalysisError, AnalysisPipeline
from ..pipelines.ingest import IngestionError, IngestionPipeline
from ..pipelines.scoring import diff_stats, review_score, score_snapshot

ANALYSIS_TYPES = {"analyzer", "architecture", "code_review", "docs", "readme"}


class JobService:
    """Runs a job intent through ingestion, analysis and persistence."""

    def __init__(
        self,
        settings: Settings,
        job_store: JobStore,
        ingestion: IngestionPipeline,
        analysis: AnalysisPipeline,
    ) -> None:
        self.settings = settings
        self.job_store = job_store
        self.ingestion = ingestion
        self.analysis = analysis

    def process(self, intent: JobIntent) -> JobResult:
        job_id = intent.job_id
        self.job_store.mark_running(job_id)
        if intent.type not in ANALYSIS_TYPES:
            message = f"unsupported job type: {intent.type}"
            self.job_store.finish(job_id, error=message)
            return JobResult(job_id=job_id, status="failed", error=message)
        if intent.type == "code_review":
            return self._process_review(intent, job_id)
        if not intent.organization_id or not intent.repository_id or not intent.archive_url:
            message = "analysis job requires organization_id, repository_id and archive_url"
            self.job_store.finish(job_id, error=message)
            return JobResult(job_id=job_id, status="failed", error=message)
        try:
            summary, snapshot = self.ingestion.run(
                repository_id=intent.repository_id,
                organization_id=intent.organization_id,
                archive_url=intent.archive_url,
                archive_token=intent.archive_token,
                repository_name=intent.payload.get("repository_name") or intent.payload.get("name"),
            )
            context = self._top_file_context(snapshot)
            result, model = self.analysis.run(type_=intent.type, snapshot=summary, context=context)
            health = score_snapshot(snapshot)
            if intent.type == "analyzer":
                score = {"overall": result["overall"], "health": health}
            else:
                score = health
                result["score"] = health
            result["repository"] = {
                "name": summary["repository_name"],
                "file_count": summary["file_count"],
                "languages": summary["languages"],
                "dependency_count": summary["dependency_count"],
            }
            self.job_store.insert_analysis(
                organization_id=intent.organization_id,
                repository_id=intent.repository_id,
                type_=intent.type,
                model=model,
                score=score,
                report=result,
            )
            self.job_store.finish(job_id, result=result, model=model)
            return JobResult(job_id=job_id, status="succeeded", result=result, model=model)
        except (IngestionError, AnalysisError) as exc:
            self.job_store.finish(job_id, error=str(exc))
            return JobResult(job_id=job_id, status="failed", error=str(exc))

    def _process_review(self, intent: JobIntent, job_id: str) -> JobResult:
        diff = (intent.payload.get("diff") or "").strip()
        if not intent.organization_id or not intent.repository_id or not diff:
            message = (
                "code_review job requires organization_id, repository_id and a "
                "pull request diff in the payload"
            )
            self.job_store.finish(job_id, error=message)
            return JobResult(job_id=job_id, status="failed", error=message)
        try:
            pr_number = intent.payload.get("pull_request_number")
            repository_name = (
                intent.payload.get("repository_name") or intent.payload.get("name") or "unknown"
            )
            summary = {
                "repository_name": repository_name,
                "pull_request_number": pr_number,
                **diff_stats(diff),
            }
            result, model = self.analysis.run(
                type_="code_review", snapshot=summary, context=diff
            )
            score = review_score(result.get("severity_counts", {}))
            result["score"] = score
            result["pull_request_number"] = pr_number
            result["files_changed"] = summary["files_changed"]
            result["additions"] = summary["additions"]
            result["deletions"] = summary["deletions"]
            result["repository"] = {
                "name": repository_name,
                "pull_request_number": pr_number,
            }
            self.job_store.insert_analysis(
                organization_id=intent.organization_id,
                repository_id=intent.repository_id,
                type_="code_review",
                model=model,
                score=score,
                report=result,
            )
            self.job_store.finish(job_id, result=result, model=model)
            return JobResult(job_id=job_id, status="succeeded", result=result, model=model)
        except AnalysisError as exc:
            self.job_store.finish(job_id, error=str(exc))
            return JobResult(job_id=job_id, status="failed", error=str(exc))

    def _top_file_context(self, snapshot: RepositorySnapshot, budget: int = 3000) -> str:
        ranked: list[dict] = []
        for entry in sorted(snapshot.files, key=lambda f: len(f.content), reverse=True)[:30]:
            chunks = chunk_text(
                entry.content, self.settings.chunk_chars, self.settings.chunk_overlap_chars
            )[:2]
            for chunk in chunks:
                ranked.append(
                    {
                        "path": entry.path,
                        "language": entry.language,
                        "content": chunk,
                        "score": len(entry.content),
                    }
                )
        return render_context(assemble_context(ranked, budget))
