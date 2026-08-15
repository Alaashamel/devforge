"""Tests for deterministic snapshot scoring."""

from app.ingestion.snapshot import build_snapshot
from app.pipelines.scoring import score_snapshot


def test_score_rich_repository():
    entries = [
        ("README.md", b"# demo\n"),
        ("LICENSE", b"MIT\n"),
        ("src/main.py", b"x = 1\n" * 2000),
        ("tests/test_main.py", b"def test_x():\n    pass\n"),
        (".github/workflows/ci.yml", b"name: ci\n"),
        ("pyproject.toml", b'[project]\ndependencies = ["fastapi"]\n'),
    ]
    snapshot = build_snapshot(entries)
    result = score_snapshot(snapshot)
    assert result["score"] > 50
    assert result["score"] <= 100
    assert result["max"] == 100
    assert "readme" in result["breakdown"]
    assert "tests" in result["breakdown"]
    assert "ci" in result["breakdown"]


def test_score_empty_repository():
    snapshot = build_snapshot([])
    result = score_snapshot(snapshot)
    assert result["score"] == 0
    assert result["breakdown"] == {}


def test_score_never_exceeds_max():
    entries = [
        ("README.md", b"# d\n"),
        ("LICENSE", b"MIT\n"),
        ("tests/t.py", b"x\n"),
        (".github/workflows/ci.yml", b"n\n"),
        ("pyproject.toml", b'[project]\ndependencies = ["a"]\n'),
        ("src/a.py", b"x = 1\n" * 3000),
        ("src/b.py", b"x = 1\n"),
    ]
    snapshot = build_snapshot(entries)
    result = score_snapshot(snapshot)
    assert result["score"] <= 100
