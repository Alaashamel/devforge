const UP = `
CREATE TABLE github_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_user_id bigint NOT NULL UNIQUE,
  github_login text NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX github_connections_user_id_idx ON github_connections (user_id);

CREATE TABLE repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  github_repo_id bigint NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  full_name text NOT NULL,
  description text,
  owner_type text NOT NULL DEFAULT 'org' CHECK (owner_type IN ('user', 'org')),
  default_branch text NOT NULL DEFAULT 'main',
  primary_language text,
  url text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  stars integer NOT NULL DEFAULT 0,
  size_kb bigint NOT NULL DEFAULT 0,
  pushed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, github_repo_id)
);
CREATE INDEX repositories_organization_id_idx ON repositories (organization_id);

CREATE TABLE repository_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  github_webhook_id bigint,
  secret_encrypted text,
  events text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX repository_webhooks_repository_id_idx ON repository_webhooks (repository_id);

CREATE TABLE pull_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed', 'merged')),
  author text,
  head_ref text NOT NULL,
  base_ref text NOT NULL,
  additions integer NOT NULL DEFAULT 0,
  deletions integer NOT NULL DEFAULT 0,
  merged_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repository_id, number)
);
CREATE INDEX pull_requests_repository_id_idx ON pull_requests (repository_id);
CREATE INDEX pull_requests_repository_id_created_at_idx ON pull_requests (repository_id, created_at DESC);

CREATE TABLE code_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pull_request_id uuid REFERENCES pull_requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  summary text,
  findings jsonb NOT NULL DEFAULT '[]',
  severity_counts jsonb NOT NULL DEFAULT '{}',
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX code_reviews_pull_request_id_idx ON code_reviews (pull_request_id);
CREATE INDEX code_reviews_repository_id_idx ON code_reviews (repository_id);
`;

const DOWN = `
DROP TABLE IF EXISTS code_reviews;
DROP TABLE IF EXISTS pull_requests;
DROP TABLE IF EXISTS repository_webhooks;
DROP TABLE IF EXISTS repositories;
DROP TABLE IF EXISTS github_connections;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
