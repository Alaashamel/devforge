const UP = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path text NOT NULL,
  language text,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  token_count integer NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_document_chunks_repository_id_idx ON ai_document_chunks (repository_id);
CREATE INDEX ai_document_chunks_content_gin_idx
  ON ai_document_chunks USING gin (to_tsvector('english', content));
CREATE INDEX ai_document_chunks_embedding_hnsw_idx
  ON ai_document_chunks USING hnsw (embedding vector_cosine_ops);
`;

const DOWN = `
DROP TABLE IF EXISTS ai_document_chunks;
DROP EXTENSION IF EXISTS vector;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
