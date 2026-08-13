const UP = `
CREATE UNIQUE INDEX github_connections_user_id_unique_idx ON github_connections (user_id);
`;

const DOWN = `
DROP INDEX IF EXISTS github_connections_user_id_unique_idx;
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
