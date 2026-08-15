"""Repository ingestion pipeline: archive → snapshot → chunks → vector store."""

from ..auth import verify_archive_token
from ..config import Settings
from ..context.vector_store import ChunkRecord, VectorStore
from ..ingestion import build_snapshot, chunk_text
from ..ingestion.chunk import estimate_tokens
from ..ingestion.fetch import ArchiveError, extract_archive, fetch_archive
from ..ingestion.snapshot import RepositorySnapshot
from ..providers.embeddings import Embedder

EMBED_BATCH = 64


class IngestionError(Exception):
    """Raised when repository ingestion fails."""


class IngestionPipeline:
    """Fetches an archive, builds a snapshot and stores RAG chunks."""

    def __init__(
        self, settings: Settings, embedder: Embedder, vector_store: VectorStore, http=None
    ) -> None:
        self.settings = settings
        self.embedder = embedder
        self.vector_store = vector_store
        self.http = http

    def run(
        self,
        *,
        repository_id: str,
        organization_id: str,
        archive_url: str,
        archive_token: str,
        repository_name: str | None = None,
    ) -> tuple[dict, RepositorySnapshot]:
        if not verify_archive_token(
            repository_id,
            archive_token,
            self.settings.job_secret,
            self.settings.job_token_ttl_seconds,
        ):
            raise IngestionError("invalid or expired archive token")
        try:
            buffer = fetch_archive(archive_url, self.http)
        except ArchiveError as exc:
            raise IngestionError(f"archive fetch failed: {exc}") from exc
        try:
            entries = extract_archive(buffer)
        except ArchiveError as exc:
            raise IngestionError(f"archive extraction failed: {exc}") from exc

        snapshot = build_snapshot(entries, self.settings.max_files, self.settings.max_file_bytes)
        if not snapshot.files:
            raise IngestionError("no ingestible files found in archive")

        chunk_records: list[ChunkRecord] = []
        for entry in snapshot.files:
            texts = chunk_text(
                entry.content, self.settings.chunk_chars, self.settings.chunk_overlap_chars
            )
            for index in range(0, len(texts), EMBED_BATCH):
                batch = texts[index : index + EMBED_BATCH]
                vectors = self.embedder.embed(batch)
                for chunk, vector in zip(batch, vectors, strict=True):
                    chunk_records.append(
                        ChunkRecord(
                            path=entry.path,
                            language=entry.language,
                            content=chunk,
                            token_count=estimate_tokens(chunk),
                            embedding=vector,
                        )
                    )

        self.vector_store.clear_repository(repository_id)
        if chunk_records:
            self.vector_store.store_chunks(organization_id, repository_id, chunk_records)

        dependency_count = sum(
            parsed.get("dependency_count", 0) for parsed in snapshot.dependencies.values()
        )
        summary = {
            "repository_name": repository_name or "repository",
            "file_count": len(snapshot.files),
            "skipped_files": snapshot.skipped,
            "total_lines": snapshot.total_lines,
            "total_bytes": snapshot.total_bytes,
            "languages": snapshot.languages,
            "dependency_count": dependency_count,
            "dependencies": snapshot.dependencies,
            "chunk_count": len(chunk_records),
            "secrets_redacted": snapshot.secrets_redacted,
            "truncated_files": snapshot.truncated_files,
        }
        return summary, snapshot
