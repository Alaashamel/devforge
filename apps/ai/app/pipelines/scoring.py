"""Deterministic heuristic scoring — code, not model output."""

from ..ingestion.snapshot import RepositorySnapshot
from ..models.schemas import REVIEW_SEVERITIES


def score_snapshot(snapshot: RepositorySnapshot) -> dict:
    """Score repository health from structural signals (0-100)."""
    score = 0
    breakdown: dict[str, int] = {}

    def add(key: str, points: int) -> None:
        nonlocal score
        breakdown[key] = points
        score += points

    if snapshot.has_readme:
        add("readme", 10)
    if snapshot.has_license:
        add("license", 5)
    if snapshot.has_ci:
        add("ci", 5)
    if snapshot.has_tests:
        add("tests", 10)
    if snapshot.dependencies:
        add("dependencies", 10)
    if len(snapshot.languages) >= 2:
        add("language_diversity", 5)
    file_count = len(snapshot.files)
    if file_count >= 10:
        add("size_large", 10)
    elif file_count >= 1:
        add("size_small", 5)
    if snapshot.total_lines >= 1000:
        add("code_volume", 10)
    elif snapshot.total_lines >= 100:
        add("code_volume", 5)

    return {"score": min(score, 100), "breakdown": breakdown, "max": 100}


REVIEW_SEVERITY_PENALTY: dict[str, int] = {
    "critical": 30,
    "high": 15,
    "medium": 6,
    "low": 2,
    "info": 0,
}


def review_score(counts: dict) -> dict:
    """Score a code review from its severity counts (0-100, deterministic).

    Each finding deducts a fixed penalty by severity so the same findings
    always produce the same score regardless of model formatting choices.
    """
    penalty = sum(
        REVIEW_SEVERITY_PENALTY.get(severity, 0) * int(counts.get(severity, 0) or 0)
        for severity in REVIEW_SEVERITIES
    )
    return {
        "score": max(0, min(100, 100 - penalty)),
        "breakdown": counts,
        "max": 100,
    }


def diff_stats(diff: str) -> dict:
    """Count changed files and +/- lines from a unified diff (best effort)."""
    files = additions = deletions = 0
    for line in diff.splitlines():
        if line.startswith("diff --git "):
            files += 1
        elif line.startswith("@@ ") or line.startswith("+++") or line.startswith("---"):
            continue
        elif line.startswith("+"):
            additions += 1
        elif line.startswith("-"):
            deletions += 1
    return {"files_changed": files, "additions": additions, "deletions": deletions}
