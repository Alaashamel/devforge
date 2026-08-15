"""Fetch and extract a credential-free repository archive."""

import io
import re
import tarfile
import zipfile
from pathlib import Path
from urllib.parse import unquote

import httpx


class ArchiveError(Exception):
    """Raised when an archive cannot be fetched or extracted."""

_DRIVE_LEADING_SLASH = re.compile(r"^/[A-Za-z]:")


def _file_url_path(url: str) -> Path:
    """Turn a file:// URL into a Path (handles Windows drive prefixes + %-encoding)."""
    raw = unquote(url[len("file://") :])
    if _DRIVE_LEADING_SLASH.match(raw):
        raw = raw[1:]
    return Path(raw)


def fetch_archive(url: str, http: httpx.Client | None = None) -> io.BytesIO:
    """Download an archive URL into memory.

    Supports file:// URLs for local fixtures/tests so the pipeline runs
    offline; production archives are downloaded from the core API.
    """
    if url.startswith("file://"):
        path = _file_url_path(url)
        try:
            return io.BytesIO(path.read_bytes())
        except OSError as exc:
            raise ArchiveError(f"cannot read local archive {path}: {exc}") from exc
    client = http or httpx.Client(timeout=120.0, follow_redirects=True)
    try:
        response = client.get(url)
    except httpx.HTTPError as exc:
        raise ArchiveError(f"archive download failed: {exc}") from exc
    if response.status_code >= 400:
        raise ArchiveError(f"archive download returned HTTP {response.status_code}")
    return io.BytesIO(response.content)


def _normalize(path: str) -> str:
    """Strip the leading '<owner>-<repo>-<sha>/' directory GitHub tarballs add."""
    parts = [p for p in path.split("/") if p]
    if len(parts) > 1:
        parts = parts[1:]
    return "/".join(parts)


def extract_archive(buffer: io.BytesIO | bytes) -> list[tuple[str, bytes]]:
    """Extract a tar or zip archive into (normalized_path, bytes) pairs."""
    if isinstance(buffer, bytes):
        buffer = io.BytesIO(buffer)
    buffer.seek(0)
    if tarfile.is_tarfile(buffer):
        return _extract_tar(buffer)
    buffer.seek(0)
    if zipfile.is_zipfile(buffer):
        return _extract_zip(buffer)
    raise ArchiveError("archive is neither a tar nor a zip file")


def _extract_tar(buffer: io.BytesIO) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    with tarfile.open(fileobj=buffer, mode="r:*") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            path = _normalize(member.name)
            if not path:
                continue
            try:
                data = tar.extractfile(member)
                out.append((path, data.read() if data else b""))
            except (tarfile.TarError, OSError):
                continue
    return out


def _extract_zip(buffer: io.BytesIO) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(buffer) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            path = _normalize(info.filename)
            if not path:
                continue
            try:
                out.append((path, zf.read(info)))
            except (zipfile.BadZipFile, OSError):
                continue
    return out
