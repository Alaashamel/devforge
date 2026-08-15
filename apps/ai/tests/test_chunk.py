"""Tests for text chunking."""

import pytest

from app.ingestion.chunk import chunk_text, estimate_tokens


def test_short_text_is_single_chunk():
    assert chunk_text("hello world") == ["hello world"]


def test_empty_text_is_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_chunks_are_bounded():
    text = "word " * 4000
    chunks = chunk_text(text, chunk_chars=500, overlap_chars=50)
    assert len(chunks) > 1
    assert all(len(chunk) <= 500 for chunk in chunks)


def test_chunks_preserve_start_and_end():
    body = "\n".join(f"line {i} {i * 100}" for i in range(400))
    chunks = chunk_text(body, chunk_chars=300, overlap_chars=30)
    joined = "".join(chunks)
    assert joined.startswith("line 0")
    assert "line 399" in joined


def test_overlap_advances_through_long_text():
    chunks = chunk_text("a" * 1000, chunk_chars=200, overlap_chars=20)
    assert len(chunks) >= 4


def test_no_duplicate_chunks_when_no_overlap():
    text = "x" * 600
    chunks = chunk_text(text, chunk_chars=200, overlap_chars=0)
    assert len(chunks) == 3
    assert len(set(chunks)) == 1


def test_estimate_tokens():
    assert estimate_tokens("a" * 8) == 2
    assert estimate_tokens("") == 1


def test_invalid_configuration_raises():
    with pytest.raises(ValueError):
        chunk_text("x", chunk_chars=0)
    with pytest.raises(ValueError):
        chunk_text("x", chunk_chars=10, overlap_chars=10)
    with pytest.raises(ValueError):
        chunk_text("x", chunk_chars=10, overlap_chars=-1)
