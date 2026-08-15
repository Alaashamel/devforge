"""pgvector-backed document chunk store."""

from dataclasses import dataclass

import psycopg

SEARCH_LIMIT = 8


@dataclass
class ChunkRecord:
    path: str
    language: str | None
    content: str
    token_count: int
    embedding: list[float]


def _vec(values: list[float]) -> str:
    """Render a float list as a pgvector literal string."""
    return "[" + ",".join(f"{value:.8g}" for value in values) + "]"


class VectorStore:
    """Stores and searches document chunks in ai_document_chunks."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url)

    def clear_repository(self, repository_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM ai_document_chunks WHERE repository_id = %s",
                (repository_id,),
            )

    def store_chunks(
        self, organization_id: str, repository_id: str, chunks: list[ChunkRecord]
    ) -> int:
        with self._connect() as conn:
            for chunk in chunks:
                conn.execute(
                    """
                    INSERT INTO ai_document_chunks
                      (organization_id, repository_id, path, language, content,
                       token_count, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
                    """,
                    (
                        organization_id,
                        repository_id,
                        chunk.path,
                        chunk.language,
                        chunk.content,
                        chunk.token_count,
                        _vec(chunk.embedding),
                    ),
                )
        return len(chunks)

    def vector_search(
        self,
        organization_id: str,
        repository_id: str,
        embedding: list[float],
        limit: int = SEARCH_LIMIT,
    ) -> list[dict]:
        query = """
            SELECT path, language, content, 1 - (embedding <=> %s::vector) AS score
            FROM ai_document_chunks
            WHERE organization_id = %s AND repository_id = %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        params = (_vec(embedding), organization_id, repository_id, _vec(embedding), limit)
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [
            {"path": r[0], "language": r[1], "content": r[2], "score": float(r[3])}
            for r in rows
        ]

    def keyword_search(
        self, organization_id: str, repository_id: str, query: str, limit: int = SEARCH_LIMIT
    ) -> list[dict]:
        sql = """
            SELECT path, language, content,
                   ts_rank_cd(
                     to_tsvector('english', content),
                     plainto_tsquery('english', %s)
                   ) AS score
            FROM ai_document_chunks
            WHERE organization_id = %s AND repository_id = %s
              AND to_tsvector('english', content) @@ plainto_tsquery('english', %s)
            ORDER BY score DESC
            LIMIT %s
        """
        params = (query, organization_id, repository_id, query, limit)
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {"path": r[0], "language": r[1], "content": r[2], "score": float(r[3])}
            for r in rows
        ]
