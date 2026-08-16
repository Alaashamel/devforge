const UP = `
ALTER TABLE ai_conversations
  ADD COLUMN repository_id uuid REFERENCES repositories(id) ON DELETE CASCADE;
CREATE INDEX ai_conversations_repository_id_idx ON ai_conversations (repository_id);
`;

const DOWN = `
DROP INDEX IF EXISTS ai_conversations_repository_id_idx;
ALTER TABLE ai_conversations DROP COLUMN IF EXISTS repository_id;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
