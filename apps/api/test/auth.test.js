import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import request from 'supertest';
import { migrateUp } from '@devforge/database';
import { hashToken } from '../src/modules/auth/tokens.js';
import { createRateLimiter } from '../src/middleware/rate-limit.js';
import {
  createCapturingMailer,
  createTestApp,
  ensureTestDatabase,
  TEST_DATABASE_URL,
  TEST_PASSWORD,
} from './auth/helpers.js';

let pool;
let mailer;
let app;

beforeAll(async () => {
  await ensureTestDatabase();
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
  const client = await pool.connect();
  try {
    await migrateUp({ client });
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE users CASCADE');
  mailer = createCapturingMailer();
  app = createTestApp({ pool, mailer });
});

async function register({ email = 'user@example.com', name = 'Test User', password = TEST_PASSWORD } = {}) {
  return request(app)
    .post('/api/v1/auth/register')
    .send({ email, name, password });
}

async function verificationToken(email) {
  const message = mailer.sent.find((m) => m.kind === 'verification' && m.to === email);
  return message?.token;
}

async function createVerifiedUser(email = 'user@example.com') {
  await register({ email });
  const token = await verificationToken(email);
  await request(app).post('/api/v1/auth/verify-email').send({ token });
  return { email };
}

async function login(email = 'user@example.com', password = TEST_PASSWORD) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

describe('POST /api/v1/auth/register', () => {
  it('creates a pending_verification user and returns a dev verification link', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: 'user@example.com',
      name: 'Test User',
      status: 'pending_verification',
    });
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.verificationUrl).toContain('/verify-email?token=');
  });

  it('rejects a duplicate email with 409', async () => {
    await register();
    const res = await register();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('matches emails case-insensitively on duplicate check', async () => {
    await register({ email: 'User@Example.com' });
    const res = await register({ email: 'user@example.com' });
    expect(res.status).toBe(409);
  });

  it('rejects invalid payloads with per-field details', async () => {
    const cases = [
      { email: 'not-an-email', name: 'A', password: TEST_PASSWORD },
      { email: 'a@b.co', name: 'A', password: 'short1' },
      { email: 'a@b.co', name: 'A', password: 'onlyletters' },
      { email: 'a@b.co', name: 'A', password: '1234567890' },
      { email: 'a@b.co', name: '', password: TEST_PASSWORD },
    ];
    for (const body of cases) {
      const res = await request(app).post('/api/v1/auth/register').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeInstanceOf(Array);
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });

  it('rejects unknown body keys', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@b.co', name: 'A', password: TEST_PASSWORD, admin: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  it('activates the account and consumes the single-use token', async () => {
    await register();
    const token = await verificationToken('user@example.com');
    expect(token).toBeTruthy();

    const res = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('active');
    expect(res.body.data.user.emailVerifiedAt).toBeTruthy();

    const replay = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(replay.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({ token: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in a verified user and returns a session', async () => {
    await createVerifiedUser();
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'user@example.com', status: 'active' });
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('rejects an unknown email', async () => {
    const res = await login('ghost@example.com');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects a wrong password without leaking account state', async () => {
    await createVerifiedUser();
    const res = await login('user@example.com', 'WrongPass123');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('blocks login before email verification', async () => {
    await register();
    const res = await login();
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('verify your email');
  });

  it('blocks disabled accounts', async () => {
    await createVerifiedUser();
    await pool.query(`UPDATE users SET status = 'disabled' WHERE email = 'user@example.com'`);
    const res = await login();
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('disabled');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the profile with a valid access token', async () => {
    await createVerifiedUser();
    const session = await login();
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'user@example.com', name: 'Test User' });
  });

  it('rejects a missing token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const { createAccessTokenService } = await import('../src/modules/auth/tokens.js');
    const rogue = createAccessTokenService({ secret: 'b'.repeat(40) });
    const token = await rogue.sign({ id: '00000000-0000-0000-0000-000000000099', email: 'x@y.z' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and revokes the old one', async () => {
    await createVerifiedUser();
    const session = await login();
    const first = session.body.data.refreshToken;

    const res = await request(app).post('/api/v1/auth/refresh').send({ token: first });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(first);

    const replay = await request(app).post('/api/v1/auth/refresh').send({ token: first });
    expect(replay.status).toBe(401);
  });

  it('revokes the whole token family when a rotated token is replayed', async () => {
    await createVerifiedUser();
    const s1 = await login();
    const s2 = await login();
    const token1 = s1.body.data.refreshToken;
    const token2 = s2.body.data.refreshToken;

    await request(app).post('/api/v1/auth/refresh').send({ token: token1 });
    const replay = await request(app).post('/api/v1/auth/refresh').send({ token: token1 });
    expect(replay.status).toBe(401);

    const second = await request(app).post('/api/v1/auth/refresh').send({ token: token2 });
    expect(second.status).toBe(401);
  });

  it('rejects an expired refresh token', async () => {
    await createVerifiedUser();
    const session = await login();
    const userId = session.body.data.user.id;
    const token = 'expired-refresh-token';
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() - interval '1 hour')`,
      [userId, hashToken(token)],
    );
    const res = await request(app).post('/api/v1/auth/refresh').send({ token });
    expect(res.status).toBe(401);
  });

  it('rejects a token that was logged out', async () => {
    await createVerifiedUser();
    const session = await login();
    const token = session.body.data.refreshToken;
    await request(app).post('/api/v1/auth/logout').send({ token });
    const res = await request(app).post('/api/v1/auth/refresh').send({ token });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token and is idempotent', async () => {
    await createVerifiedUser();
    const session = await login();
    const token = session.body.data.refreshToken;

    const first = await request(app).post('/api/v1/auth/logout').send({ token });
    expect(first.status).toBe(204);

    const second = await request(app).post('/api/v1/auth/logout').send({ token });
    expect(second.status).toBe(204);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  it('always returns 202 without leaking account existence', async () => {
    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'unknown@example.com' });
    expect(known.status).toBe(202);
    expect(known.body.data.ok).toBe(true);
    expect(JSON.stringify(known.body)).not.toContain('token');

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.co' });
    expect(res.status).toBe(202);
    expect(res.body.data.ok).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('token');
  });

  it('mints a reset token for a known user', async () => {
    await createVerifiedUser();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'user@example.com' });
    const message = mailer.sent.find((m) => m.kind === 'reset');
    expect(message?.to).toBe('user@example.com');
    expect(message.token).toBeTruthy();
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  async function issueResetToken(email = 'user@example.com') {
    await request(app).post('/api/v1/auth/forgot-password').send({ email });
    return mailer.sent.find((m) => m.kind === 'reset')?.token;
  }

  it('sets a new password and revokes existing sessions', async () => {
    await createVerifiedUser();
    const session = await login();
    const token = await issueResetToken();
    expect(token).toBeTruthy();

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'NewStr0ngPass!' });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);

    const oldLogin = await login('user@example.com', TEST_PASSWORD);
    expect(oldLogin.status).toBe(401);

    const newLogin = await login('user@example.com', 'NewStr0ngPass!');
    expect(newLogin.status).toBe(200);

    const oldRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ token: session.body.data.refreshToken });
    expect(oldRefresh.status).toBe(401);
  });

  it('consumes the single-use reset token', async () => {
    await createVerifiedUser();
    const token = await issueResetToken();
    await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'NewStr0ngPass!' });
    const replay = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'AnotherPass123' });
    expect(replay.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'nope', password: 'NewStr0ngPass!' });
    expect(res.status).toBe(401);
  });
});

describe('auth rate limiting', () => {
  beforeEach(() => {
    const limiter = createRateLimiter({
      limits: {
        login: { windowMs: 60_000, max: 3 },
        register: { windowMs: 60_000, max: 2 },
        refresh: { windowMs: 60_000, max: 1000 },
        logout: { windowMs: 60_000, max: 1000 },
        'verify-email': { windowMs: 60_000, max: 1000 },
        'forgot-password': { windowMs: 60_000, max: 1000 },
        'reset-password': { windowMs: 60_000, max: 1000 },
      },
    });
    app = createTestApp({ pool, mailer, limiter });
  });

  it('returns 429 with Retry-After once the login limit is exceeded', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x' });
    }
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeTruthy();
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('returns 429 once the register limit is exceeded', async () => {
    const body = { email: 'a@b.co', name: 'A', password: TEST_PASSWORD };
    await request(app).post('/api/v1/auth/register').send(body);
    await request(app).post('/api/v1/auth/register').send(body);
    const res = await request(app).post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(429);
  });
});
