"""Tests for archive fetching and extraction."""

import io
import tarfile
import zipfile
from pathlib import Path

import pytest

from app.ingestion.fetch import ArchiveError, extract_archive, fetch_archive

_TAR_FILES = {
    "owner-repo-sha/README.md": b"# readme\n",
    "owner-repo-sha/src/main.py": b"print('hi')\n",
    "owner-repo-sha/.git/config": b"[core]\n",
}


def _write_tar(path: Path) -> Path:
    with tarfile.open(path, "w:gz") as tar:
        for name, data in _TAR_FILES.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return path


def _write_zip(path: Path) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("repo-dir/README.md", "# hi\n")
        zf.writestr("repo-dir/lib/util.py", "x = 1\n")
    return path


def test_extract_tar_normalizes_leading_directory(tmp_path):
    entries = extract_archive(_write_tar(tmp_path / "a.tar.gz").read_bytes())
    paths = {path for path, _ in entries}
    assert "README.md" in paths
    assert "src/main.py" in paths
    assert ".git/config" in paths  # normalization strips only the leading dir


def test_extract_tar_from_file_object():
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        info = tarfile.TarInfo("top/only.txt")
        info.size = 3
        tar.addfile(info, io.BytesIO(b"abc"))
    buffer.seek(0)
    entries = extract_archive(buffer)
    assert ("only.txt", b"abc") in entries


def test_extract_zip_normalizes_root_directory(tmp_path):
    entries = extract_archive(_write_zip(tmp_path / "b.zip").read_bytes())
    paths = {path for path, _ in entries}
    assert paths == {"README.md", "lib/util.py"}


def test_extract_rejects_invalid_archive():
    with pytest.raises(ArchiveError):
        extract_archive(io.BytesIO(b"not an archive at all"))


def test_fetch_archive_reads_file_url(tmp_path):
    archive = _write_tar(tmp_path / "c.tar.gz")
    buffer = fetch_archive(archive.as_uri())
    entries = extract_archive(buffer)
    assert ("README.md", b"# readme\n") in entries


def test_fetch_archive_missing_file_raises():
    with pytest.raises(ArchiveError):
        fetch_archive("file:///nonexistent/does-not-exist.tar.gz")
