"""Normalized repository snapshot from extracted archive entries."""

from dataclasses import dataclass, field
from typing import Any

from .filter import is_binary, is_ignored
from .languages import language_for
from .manifests import is_manifest, parse_manifest
from .redact import redact_secrets


@dataclass
class FileEntry:
    path: str
    content: str
    language: str | None
    size_bytes: int


@dataclass
class RepositorySnapshot:
    files: list[FileEntry] = field(default_factory=list)
    languages: dict[str, int] = field(default_factory=dict)
    dependencies: dict[str, Any] = field(default_factory=dict)
    has_readme: bool = False
    has_license: bool = False
    has_tests: bool = False
    has_ci: bool = False
    total_lines: int = 0
    total_bytes: int = 0
    skipped: int = 0
    secrets_redacted: int = 0
    truncated_files: int = 0


_README_NAMES = {"readme", "readme.md", "readme.markdown", "readme.rst", "readme.txt"}
_LICENSE_NAMES = {"license", "license.md", "license.txt", "copying", "copying.md"}
_CI_MARKERS = (".github", "workflows", ".gitlab-ci", "jenkinsfile", ".circleci", ".travis")


def _stem(name: str) -> str:
    dot = name.rfind(".")
    return name[:dot].lower() if dot > 0 else name.lower()


def _flags(path: str, name: str) -> tuple[bool, bool, bool, bool]:
    lower = path.lower()
    readme = name in _README_NAMES or _stem(name) == "readme"
    license_ = name in _LICENSE_NAMES or _stem(name) in {"license", "copying"}
    tests = (
        name.startswith("test_")
        or name.startswith("_test")
        or ".test." in name
        or "/test/" in lower
        or "/tests/" in lower
        or "/spec/" in lower
    )
    ci = any(marker in lower for marker in _CI_MARKERS)
    return readme, license_, tests, ci


def build_snapshot(
    entries: list[tuple[str, bytes]],
    max_files: int = 2000,
    max_file_bytes: int = 512 * 1024,
) -> RepositorySnapshot:
    """Filter, decode and redact archive entries into a repository snapshot."""
    snapshot = RepositorySnapshot()
    used = 0
    for path, data in sorted(entries, key=lambda item: item[0]):
        if is_ignored(path) or is_binary(data):
            snapshot.skipped += 1
            continue
        if len(data) > max_file_bytes:
            snapshot.truncated_files += 1
            data = data[:max_file_bytes]
        if used >= max_files:
            snapshot.skipped += 1
            continue
        content = data.decode("utf-8", errors="replace")
        content, redacted = redact_secrets(content)
        snapshot.secrets_redacted += redacted
        name = path.rsplit("/", 1)[-1]
        readme, license_, tests, ci = _flags(path, name)
        snapshot.files.append(
            FileEntry(
                path=path,
                content=content,
                language=language_for(path),
                size_bytes=len(data),
            )
        )
        used += 1
        snapshot.total_bytes += len(data)
        snapshot.total_lines += content.count("\n") + 1
        language = language_for(path)
        if language:
            snapshot.languages[language] = snapshot.languages.get(language, 0) + 1
        snapshot.has_readme = snapshot.has_readme or readme
        snapshot.has_license = snapshot.has_license or license_
        snapshot.has_tests = snapshot.has_tests or tests
        snapshot.has_ci = snapshot.has_ci or ci
        if is_manifest(path) and content:
            parsed = parse_manifest(path, content)
            if parsed.get("dependencies") is not None:
                snapshot.dependencies[path] = parsed
    return snapshot
