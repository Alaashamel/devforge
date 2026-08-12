const UP = `
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 60),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_id_read_at_idx ON notifications (user_id, read_at);

CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 60),
  subject_type text NOT NULL CHECK (char_length(subject_type) BETWEEN 1 AND 60),
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_organization_id_created_at_idx ON activities (organization_id, created_at DESC);
CREATE INDEX activities_subject_idx ON activities (subject_type, subject_id);
`;

const DOWN = `
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS notifications;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
