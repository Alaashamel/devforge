"""Tests for the ingestion pipeline (offline, fake vector store).

validate-repo: intentional secret-pattern fixtures
"""

import io
import tarfile

import pytest

from app.auth import sign_archive_url
from app.config import Settings
from app.pipelines.ingest import IngestionError, IngestionPipeline
from app.providers import build_embedder

SECRET = "test-secret"

_FILES = {
    "demo-repo/README.md": b"# Demo repo\n\nA tiny demo repository.\n",
    "demo-repo/pyproject.toml": b'[project]\ndependencies = ["fastapi>=0.115"]\n',
    "demo-repo/src/demo/__init__.py": (
        b"def greet(name: str) -> str:\n    return f'Hello {name}'\n" * 40
    ),
}


def _archive(tmp_path) -> str:
    archive = tmp_path / "repo.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for name, data in _FILES.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return archive.as_uri()


def _settings() -> Settings:
    return Settings(
        embedding_dim=64,
        chunk_chars=500,
        chunk_overlap_chars=50,
        job_secret=SECRET,
        job_token_ttl_seconds=300,
        database_url="unused://nowhere",
    )


class FakeVectorStore:
    def __init__(self) -> None:
        self.cleared: list[str] = []
        self.stored = 0

    def clear_repository(self, repository_id: str) -> None:
        self.cleared.append(repository_id)

    def store_chunks(self, organization_id: str, repository_id: str, chunks) -> int:
        self.stored += len(chunks)
        return len(chunks)


def _pipeline(store: FakeVectorStore | None = None) -> tuple[IngestionPipeline, FakeVectorStore]:
    store = store or FakeVectorStore()
    settings = _settings()
    pipeline = IngestionPipeline(settings, build_embedder(settings), store)
    return pipeline, store


def _valid_token() -> str:
    return sign_archive_url("repo-id", 300, SECRET)


def test_ingestion_pipeline_end_to_end(tmp_path):
    pipeline, store = _pipeline()
    summary, snapshot = pipeline.run(
        repository_id="repo-id",
        organization_id="org-id",
        archive_url=_archive(tmp_path),
        archive_token=_valid_token(),
        repository_name="demo-repo",
    )
    assert summary["repository_name"] == "demo-repo"
    assert summary["file_count"] == 3
    assert summary["chunk_count"] > 0
    assert summary["dependency_count"] == 1
    assert "Python" in summary["languages"]
    assert store.cleared == ["repo-id"]
    assert store.stored == summary["chunk_count"]
    assert snapshot.has_readme


def test_ingestion_rejects_invalid_archive_token(tmp_path):
    pipeline, _ = _pipeline()
    with pytest.raises(IngestionError):
        pipeline.run(
            repository_id="repo-id",
            organization_id="org-id",
            archive_url=_archive(tmp_path),
            archive_token="bad-token",
        )


def test_ingestion_rejects_missing_archive(tmp_path):
    pipeline, _ = _pipeline()
    with pytest.raises(IngestionError):
        pipeline.run(
            repository_id="repo-id",
            organization_id="org-id",
            archive_url=(tmp_path / "missing.tar.gz").as_uri(),
            archive_token=_valid_token(),
        )


def test_ingestion_redacts_secrets_in_chunks(tmp_path):
    archive = tmp_path / "secrets.tar.gz"
    payload = b"TOKEN = 'sk-abcdefghijklmnopqrstuvwxyz'\n" * 20
    with tarfile.open(archive, "w:gz") as tar:
        info = tarfile.TarInfo("repo/src/leak.py")
        info.size = len(payload)
        tar.addfile(info, io.BytesIO(payload))
    pipeline, store = _pipeline()
    summary, _ = pipeline.run(
        repository_id="repo-id",
        organization_id="org-id",
        archive_url=archive.as_uri(),
        archive_token=_valid_token(),
    )
    assert summary["secrets_redacted"] >= 1
