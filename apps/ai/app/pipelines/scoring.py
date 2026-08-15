"""Deterministic heuristic scoring — code, not model output."""

from ..ingestion.snapshot import RepositorySnapshot


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
