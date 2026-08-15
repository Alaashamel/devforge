"""Tests for repository snapshot construction.

validate-repo: intentional secret-pattern fixtures
"""

from app.ingestion.snapshot import build_snapshot


def _entries() -> list[tuple[str, bytes]]:
    return [
        ("README.md", b"# Demo\n\nA demo repository.\n"),
        ("src/main.py", b"def main():\n    return 1\n"),
        ("node_modules/x/index.js", b"console.log('ignored')\n"),
        ("logo.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32),
        (".env", b"SECRET=value\n"),
    ]


def test_build_snapshot_basic():
    snapshot = build_snapshot(_entries())
    paths = {entry.path for entry in snapshot.files}
    assert paths == {"README.md", "src/main.py"}
    assert snapshot.languages == {"Markdown": 1, "Python": 1}
    assert snapshot.has_readme
    assert not snapshot.has_tests
    assert snapshot.total_lines >= 3


def test_build_snapshot_ignores_binary_and_vcs():
    snapshot = build_snapshot(_entries())
    assert snapshot.skipped >= 2
    assert all("node_modules" not in entry.path for entry in snapshot.files)
    assert all(not entry.path.endswith(".png") for entry in snapshot.files)
    assert all(not entry.path.endswith(".env") for entry in snapshot.files)


def test_build_snapshot_redacts_secrets():
    entries = [("src/config.py", b"TOKEN = 'sk-abcdefghijklmnopqrstuvwxyz'\n")]
    snapshot = build_snapshot(entries)
    assert snapshot.secrets_redacted >= 1
    assert "sk-abcdef" not in snapshot.files[0].content
    assert "[REDACTED]" in snapshot.files[0].content


def test_build_snapshot_parses_manifests():
    entries = [
        ("package.json", b'{"name":"demo","dependencies":{"zod":"^3"}}'),
        ("src/app.js", b"console.log(1)\n"),
    ]
    snapshot = build_snapshot(entries)
    assert "package.json" in snapshot.dependencies
    assert snapshot.dependencies["package.json"]["dependency_count"] == 1


def test_build_snapshot_respects_max_files():
    entries = [(f"src/module{i}.py", b"x = 1\n") for i in range(10)]
    snapshot = build_snapshot(entries, max_files=3)
    assert len(snapshot.files) == 3
    assert snapshot.skipped == 7


def test_build_snapshot_truncates_oversized_files():
    entries = [("huge.txt", b"x" * 6000)]
    snapshot = build_snapshot(entries, max_file_bytes=1024)
    assert snapshot.truncated_files == 1
    assert len(snapshot.files[0].content) <= 1024


def test_build_snapshot_flags_tests_and_ci():
    entries = [
        ("tests/test_app.py", b"def test_x():\n    pass\n"),
        (".github/workflows/ci.yml", b"name: ci\n"),
        ("README.md", b"# hi\n"),
    ]
    snapshot = build_snapshot(entries)
    assert snapshot.has_tests
    assert snapshot.has_ci
    assert snapshot.has_readme
