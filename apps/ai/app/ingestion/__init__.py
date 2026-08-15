"""Repository ingestion: fetch, filter, language detection, snapshot."""

from .chunk import chunk_text
from .snapshot import FileEntry, RepositorySnapshot, build_snapshot

__all__ = ["FileEntry", "RepositorySnapshot", "build_snapshot", "chunk_text"]
