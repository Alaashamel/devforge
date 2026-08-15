"""Tests for retrieval context assembly."""

from app.context.retrieval import assemble_context, render_context


def test_assemble_context_selects_highest_scoring():
    results = [
        {"path": "a.py", "content": "x" * 40, "score": 0.4},
        {"path": "b.py", "content": "y" * 40, "score": 0.9},
        {"path": "c.py", "content": "z" * 40, "score": 0.7},
    ]
    selected = assemble_context(results, budget=1000)
    assert [source["path"] for source in selected] == ["b.py", "c.py", "a.py"]


def test_assemble_context_respects_budget():
    results = [
        {"path": f"file{i}.py", "content": "q" * 200, "score": 1.0 - i * 0.01}
        for i in range(20)
    ]
    selected = assemble_context(results, budget=100)
    assert 1 <= len(selected) <= 20


def test_assemble_context_returns_at_least_one_with_tiny_budget():
    results = [{"path": "a.py", "content": "z" * 5000, "score": 0.5}]
    selected = assemble_context(results, budget=1)
    assert len(selected) == 1


def test_assemble_context_respects_max_sources():
    results = [
        {"path": f"f{i}.py", "content": "short", "score": 1.0 - i * 0.01}
        for i in range(30)
    ]
    selected = assemble_context(results, budget=10_000, max_sources=5)
    assert len(selected) == 5


def test_render_context_includes_paths_and_content():
    sources = [
        {"path": "a.py", "content": "hello"},
        {"path": "b.md", "content": "world"},
    ]
    text = render_context(sources)
    assert "a.py" in text
    assert "hello" in text
    assert "b.md" in text
