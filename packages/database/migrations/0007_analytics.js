const UP = `
CREATE TABLE developer_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period date NOT NULL,
  commits integer NOT NULL DEFAULT 0,
  pull_requests integer NOT NULL DEFAULT 0,
  reviews integer NOT NULL DEFAULT 0,
  issues_closed integer NOT NULL DEFAULT 0,
  tasks_completed integer NOT NULL DEFAULT 0,
  velocity_points double precision NOT NULL DEFAULT 0,
  health_score integer CHECK (health_score BETWEEN 0 AND 100),
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, period)
);
CREATE INDEX developer_metrics_user_id_idx ON developer_metrics (user_id);
CREATE INDEX developer_metrics_organization_id_period_idx ON developer_metrics (organization_id, period DESC);
`;

const DOWN = `
DROP TABLE IF EXISTS developer_metrics;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
