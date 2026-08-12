// Test-environment overrides applied before test modules load, so the
// database config picks up a dedicated (non-development) database.
export const TEST_DATABASE_URL =
  'postgres://devforge:devforge@localhost:5433/devforge_test';

process.env.DATABASE_URL = process.env.DATABASE_URL || TEST_DATABASE_URL;
