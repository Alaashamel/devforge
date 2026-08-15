const UP = `
ALTER TABLE ai_analyses DROP CONSTRAINT ai_analyses_type_check;
ALTER TABLE ai_analyses
  ADD CONSTRAINT ai_analyses_type_check
  CHECK (type IN ('architecture', 'analyzer', 'code_review', 'docs', 'readme'));
`;

const DOWN = `
ALTER TABLE ai_analyses DROP CONSTRAINT ai_analyses_type_check;
ALTER TABLE ai_analyses
  ADD CONSTRAINT ai_analyses_type_check
  CHECK (type IN ('architecture', 'code_review', 'docs', 'readme'));
`;

export const up = async (db) => {
  await db.query(UP);
};

export const down = async (db) => {
  await db.query(DOWN);
};
