const UP = `
CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES repositories(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('architecture', 'code_review', 'docs', 'readme')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  model text,
  score jsonb NOT NULL DEFAULT '{}',
  report jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_analyses_organization_id_created_at_idx ON ai_analyses (organization_id, created_at DESC);
CREATE INDEX ai_analyses_repository_id_idx ON ai_analyses (repository_id);

CREATE TABLE ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_user_id_created_at_idx ON ai_conversations (user_id, created_at DESC);

CREATE TABLE ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 100000),
  sources jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_id_created_at_idx ON ai_messages (conversation_id, created_at);

CREATE TABLE ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  repository_id uuid REFERENCES repositories(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_jobs_status_idx ON ai_jobs (status);
CREATE INDEX ai_jobs_created_at_idx ON ai_jobs (created_at);
`;

const DOWN = `
DROP TABLE IF EXISTS ai_jobs;
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_conversations;
DROP TABLE IF EXISTS ai_analyses;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
