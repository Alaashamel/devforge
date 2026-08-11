// Test-environment overrides. These are applied before any test module is
// loaded, so the API configuration picks them up deterministically.
process.env.NODE_ENV = 'test';
// Keep test output clean; application logging is exercised separately.
process.env.LOG_LEVEL = 'silent';
// Point at a closed local port so database readiness is deterministically
// reported as "down" without a live PostgreSQL instance.
process.env.DATABASE_URL = 'postgres://devforge:devforge@127.0.0.1:59999/devforge_test';
