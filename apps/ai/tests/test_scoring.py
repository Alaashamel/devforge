"""Tests for deterministic snapshot scoring."""

from app.ingestion.snapshot import build_snapshot
from app.pipelines.scoring import diff_stats, review_score, score_snapshot


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


def test_review_score_starts_at_max_and_penalizes_severities():
    clean = review_score({})
    assert clean == {"score": 100, "breakdown": {}, "max": 100}

    mixed = review_score({"critical": 1, "high": 2, "info": 3})
    assert mixed["score"] == 100 - 30 - 30
    assert mixed["breakdown"] == {"critical": 1, "high": 2, "info": 3}


def test_review_score_never_goes_below_zero():
    result = review_score({"critical": 10})
    assert result["score"] == 0


def test_diff_stats_counts_files_and_lines():
    diff = (
        "diff --git a/a.js b/a.js\n"
        "index 111..222 100644\n"
        "--- a/a.js\n"
        "+++ b/a.js\n"
        "@@ -1,3 +1,4 @@\n"
        "+const x = 1;\n"
        " let y = 2;\n"
        "-return y;\n"
        "+return x + y;\n"
        "diff --git a/b.py b/b.py\n"
        "--- a/b.py\n"
        "+++ b/b.py\n"
        "@@ -0,0 +1,2 @@\n"
        "+import os\n"
        "+print(os.getcwd())\n"
    )
    result = diff_stats(diff)
    assert result == {"files_changed": 2, "additions": 4, "deletions": 1}
