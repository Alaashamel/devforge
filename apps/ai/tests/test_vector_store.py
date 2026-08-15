"""Integration tests for the pgvector store (skipped when no database)."""

import os
import uuid

import psycopg
import pytest

from app.context.vector_store import ChunkRecord, VectorStore

DATABASE_URL = os.environ.get("AI_TEST_DATABASE_URL", "postgres://devforge:devforge@localhost:5433/devforge_test")


def _database_ready() -> bool:
    if not DATABASE_URL:
        return False
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=3) as conn:
            row = conn.execute("SELECT to_regclass('ai_document_chunks')").fetchone()
            return row is not None and row[0] is not None
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _database_ready(), reason="AI_TEST_DATABASE_URL not available")


def _seed_org_repo() -> tuple[str, str]:
    org_id = str(uuid.uuid4())
    repo_id = str(uuid.uuid4())
    email = f"vector-test-{org_id}@example.com"
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute(
            "INSERT INTO users (email, password_hash, name, status) "
            "VALUES (%s, 'x', 'Vector Test', 'active')",
            (email,),
        )
        conn.execute(
            """
            INSERT INTO organizations (id, name, slug, owner_id)
            VALUES (%s, %s, %s, (SELECT id FROM users WHERE email = %s))
            """,
            (org_id, f"vector-test-{org_id}", f"vector-test-{org_id}"[:60], email),
        )
        conn.execute(
            """
            INSERT INTO repositories
              (id, organization_id, github_repo_id, name, full_name, url, default_branch)
            VALUES (%s, %s, 999999999, %s, %s, 'https://example.com/x', 'main')
            """,
            (repo_id, org_id, f"vector-{org_id}", f"vector-test/{org_id}"),
        )
    return org_id, repo_id, email


def _cleanup(org_id: str, repo_id: str, email: str) -> None:
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("DELETE FROM ai_document_chunks WHERE repository_id = %s", (repo_id,))
        conn.execute("DELETE FROM repositories WHERE id = %s", (repo_id,))
        conn.execute("DELETE FROM organizations WHERE id = %s", (org_id,))
        conn.execute("DELETE FROM users WHERE email = %s", (email,))


def _one_hot(index: int, size: int = 1536) -> list[float]:
    values = [0.0] * size
    values[index] = 1.0
    return values


def test_vector_store_roundtrip():
    store = VectorStore(DATABASE_URL)
    org_id, repo_id, email = _seed_org_repo()
    try:
        chunks = [
            ChunkRecord(
                path="src/main.py",
                language="Python",
                content="def main(): return 1",
                token_count=6,
                embedding=_one_hot(0),
            ),
            ChunkRecord(
                path="README.md",
                language="Markdown",
                content="Documentation about the widget API",
                token_count=7,
                embedding=_one_hot(1),
            ),
        ]
        store.clear_repository(repo_id)
        assert store.store_chunks(org_id, repo_id, chunks) == 2

        hits = store.vector_search(org_id, repo_id, _one_hot(1))
        assert hits
        assert hits[0]["path"] == "README.md"
        assert hits[0]["score"] > 0.9

        keyword = store.keyword_search(org_id, repo_id, "documentation")
        assert any(row["path"] == "README.md" for row in keyword)
    finally:
        _cleanup(org_id, repo_id, email)
