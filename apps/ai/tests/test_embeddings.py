"""Tests for embeddings (local deterministic hashing)."""

import math

from app.providers import hashing_embed
from app.providers.embeddings import Embedder


def test_hashing_embed_is_deterministic_and_normalized():
    first = hashing_embed(["hello world"])[0]
    second = hashing_embed(["hello world"])[0]
    assert first == second
    norm = math.sqrt(sum(v * v for v in first))
    assert abs(norm - 1.0) < 1e-6
    assert len(first) == 1536


def test_hashing_embed_distinguishes_text():
    apple = hashing_embed(["apple"])[0]
    banana = hashing_embed(["banana"])[0]
    assert apple != banana


def test_hashing_embed_custom_dimension():
    vectors = hashing_embed(["a", "b"], dim=64)
    assert len(vectors) == 2
    assert all(len(vector) == 64 for vector in vectors)


def test_embedder_local_returns_matching_vectors():
    embedder = Embedder("local", 64, "local-hash")
    vectors = embedder.embed(["a", "b", "c"])
    assert len(vectors) == 3
    assert all(len(vector) == 64 for vector in vectors)


def test_embedder_empty_input():
    embedder = Embedder("local", 64)
    assert embedder.embed([]) == []
