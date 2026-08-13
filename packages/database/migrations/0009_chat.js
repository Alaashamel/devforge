const UP = `
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_organization_id_created_at_idx ON chat_messages (organization_id, created_at DESC);
CREATE INDEX chat_messages_author_id_idx ON chat_messages (author_id);
`;

const DOWN = `
DROP TABLE IF EXISTS chat_messages;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
