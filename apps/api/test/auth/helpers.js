import pg from 'pg';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/service.js';
import { createAuthMiddleware } from '../../src/modules/auth/middleware.js';
import { createAccessTokenService } from '../../src/modules/auth/tokens.js';
import { createPasswordService } from '../../src/modules/auth/password.js';
import { createRateLimiter, AUTH_RATE_LIMITS } from '../../src/middleware/rate-limit.js';

export const TEST_DATABASE_URL =
  process.env.AUTH_TEST_DATABASE_URL ||
  'postgres://devforge:devforge@localhost:5433/devforge_test';

export const TEST_PASSWORD = 'Str0ngPassw0rd!';

export function createCapturingMailer() {
  const sent = [];
  return {
    sent,
    sendVerification(email, token) {
      sent.push({ kind: 'verification', to: email, token });
      return { url: `http://localhost:5173/verify-email?token=${encodeURIComponent(token)}` };
    },
    sendPasswordReset(email, token) {
      sent.push({ kind: 'reset', to: email, token });
      return null;
    },
  };
}

export async function ensureTestDatabase() {
  const parsed = new URL(TEST_DATABASE_URL);
  const dbName = parsed.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`unsafe test database name: ${dbName}`);
  }
  parsed.pathname = '/postgres';
  const admin = new pg.Pool({ connectionString: parsed.toString() });
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

export function createTestApp({ pool, mailer, limiter }) {
  const accessTokens = createAccessTokenService({ secret: 'a'.repeat(40), ttl: '15m' });
  const service = createAuthService({
    pool,
    password: createPasswordService({ memoryCost: 8192, timeCost: 1, parallelism: 1 }),
    accessTokens,
    mailer,
    refreshTtlDays: 7,
  });
  const middleware = createAuthMiddleware({
    accessTokens,
    resolveRole: service.resolveEffectiveRole,
  });
  const authLimiter = limiter ?? createRateLimiter({ limits: AUTH_RATE_LIMITS });
  return createApp({ auth: { service, middleware, limiter: authLimiter } });
}
