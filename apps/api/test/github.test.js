import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import pg from 'pg';
import request from 'supertest';
import { migrateUp } from '@devforge/database';
import {
  createCapturingMailer,
  createTestApp,
  ensureTestDatabase,
  TEST_DATABASE_URL,
} from './auth/helpers.js';
import { addOrgMember, auth, createOrg, registerUser } from './modules/helpers.js';
import { createGithubService } from '../src/modules/github/service.js';
import { createGithubCrypto } from '../src/modules/github/crypto.js';
import { GithubApiError } from '../src/modules/github/client.js';

let pool;
let mailer;
let app;
let github;
let client;
let fetchImpl;

const crypto = createGithubCrypto({ key: 'github-test-encryption-key' });
const oauth = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  authorizeUrl: 'https://github.com/login/oauth',
  callbackUrl: 'http://localhost:4000/api/v1/github/oauth/callback',
};

beforeAll(async () => {
  await ensureTestDatabase();
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
  const dbClient = await pool.connect();
  try {
    await migrateUp({ client: dbClient });
  } finally {
    dbClient.release();
  }
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  client = {
    getAuthenticatedUser: vi.fn(),
    listRepositories: vi.fn(),
    getRepository: vi.fn(),
    listBranches: vi.fn(),
    listCommits: vi.fn(),
    listPullRequests: vi.fn(),
    listIssues: vi.fn(),
    createWebhook: vi.fn(),
    deleteWebhook: vi.fn(),
  };
  fetchImpl = vi.fn();
  github = createGithubService({
    pool,
    client,
    crypto,
    oauth,
    webBaseUrl: 'http://localhost:5173',
    apiBaseUrl: 'http://localhost:4000',
    fetchImpl,
  });
  mailer = createCapturingMailer();
  app = createTestApp({ pool, mailer, github });
  await pool.query('TRUNCATE users CASCADE');
});

async function connectUser(userId, { githubUserId = 12345, login = 'octocat', token = 'gho_test_token' } = {}) {
  await pool.query(
    `INSERT INTO github_connections (user_id, github_user_id, github_login, access_token_encrypted, scopes)
     VALUES ($1, $2, $3, $4, ARRAY['repo', 'read:org'])`,
    [userId, githubUserId, login, crypto.encrypt(token)],
  );
}

const remoteRepo = (overrides = {}) => ({
  id: 42,
  name: 'devforge',
  full_name: 'acme/devforge',
  description: 'A dev tool',
  owner: { type: 'Organization' },
  default_branch: 'main',
  language: 'JavaScript',
  html_url: 'https://github.com/acme/devforge',
  private: false,
  stargazers_count: 5,
  size: 100,
  pushed_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

const remotePull = (overrides = {}) => ({
  number: 1,
  title: 'Add feature',
  state: 'open',
  user: { login: 'octocat' },
  head: { ref: 'feat' },
  base: { ref: 'main' },
  additions: 12,
  deletions: 3,
  merged_at: null,
  html_url: 'https://github.com/acme/devforge/pull/1',
  body: 'desc',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
  ...overrides,
});

describe('github connection', () => {
  let owner;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
  });

  it('exposes an OAuth authorize URL bound to the user', async () => {
    const res = await request(app)
      .post('/api/v1/github/oauth/begin')
      .set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    const url = new URL(res.body.data.url);
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(oauth.callbackUrl);
    expect(url.searchParams.get('scope')).toBe('repo read:org');
    const state = url.searchParams.get('state');
    expect(crypto.verify(state).userId).toBe(owner.userId);
  });

  it('reports disconnected before a connection exists', async () => {
    const res = await request(app)
      .get('/api/v1/github/connection')
      .set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ connected: false });
  });

  it('completes the OAuth flow and stores an encrypted token', async () => {
    const begin = await request(app)
      .post('/api/v1/github/oauth/begin')
      .set(auth(owner.accessToken));
    const state = new URL(begin.body.data.url).searchParams.get('state');
    client.getAuthenticatedUser.mockResolvedValue({ id: 777, login: 'octocat' });
    fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'gho_real_token',
        token_type: 'bearer',
        scope: 'repo read:org',
      }),
    });

    const res = await request(app).get(
      `/api/v1/github/oauth/callback?code=abc123&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/repositories?github=connected');

    const { rows } = await pool.query('SELECT * FROM github_connections WHERE user_id = $1', [
      owner.userId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].github_login).toBe('octocat');
    expect(rows[0].scopes).toContain('repo');
    expect(crypto.decrypt(rows[0].access_token_encrypted)).toBe('gho_real_token');
    expect(client.getAuthenticatedUser).toHaveBeenCalledWith({ token: 'gho_real_token' });

    const status = await request(app)
      .get('/api/v1/github/connection')
      .set(auth(owner.accessToken));
    expect(status.body.data).toMatchObject({ connected: true, login: 'octocat', githubUserId: 777 });
  });

  it('redirects with an error when the code exchange fails', async () => {
    const begin = await request(app)
      .post('/api/v1/github/oauth/begin')
      .set(auth(owner.accessToken));
    const state = new URL(begin.body.data.url).searchParams.get('state');
    fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'bad_verification_code', error_description: 'The code is bad' }),
    });
    const res = await request(app).get(
      `/api/v1/github/oauth/callback?code=bad&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('github=error');
    expect(new URL(res.headers.location).searchParams.get('message')).toContain(
      'GitHub authorization failed',
    );
  });

  it('rejects a forged or malformed OAuth state', async () => {
    const res = await request(app).get('/api/v1/github/oauth/callback?code=abc&state=forged');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('github=error');
  });

  it('disconnects and clears the stored token', async () => {
    await connectUser(owner.userId);
    const res = await request(app)
      .post('/api/v1/github/disconnect')
      .set(auth(owner.accessToken));
    expect(res.status).toBe(204);
    const status = await request(app)
      .get('/api/v1/github/connection')
      .set(auth(owner.accessToken));
    expect(status.body.data.connected).toBe(false);
  });
});

describe('repositories', () => {
  let owner;
  let org;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    org = await createOrg(pool, { ownerId: owner.userId, slug: `gh-${Date.now()}` });
    await connectUser(owner.userId);
  });

  const importUrl = () => `/api/v1/organizations/${org.id}/repositories/import`;

  it('requires an active connection to import', async () => {
    await pool.query('DELETE FROM github_connections');
    const res = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/devforge' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GITHUB_NOT_CONNECTED');
  });

  it('imports a repository and stores its pull requests', async () => {
    client.getRepository.mockResolvedValue(remoteRepo());
    client.listPullRequests.mockResolvedValue([
      remotePull(),
      remotePull({
        number: 2,
        title: 'Close it',
        state: 'closed',
        merged_at: '2026-08-03T00:00:00Z',
      }),
    ]);
    const res = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/devforge' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      fullName: 'acme/devforge',
      stars: 5,
      defaultBranch: 'main',
      primaryLanguage: 'JavaScript',
    });
    expect(client.getRepository).toHaveBeenCalledWith({
      token: 'gho_test_token',
      fullName: 'acme/devforge',
    });

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/repositories`)
      .set(auth(owner.accessToken));
    expect(list.body.data).toHaveLength(1);

    const prs = await request(app)
      .get(`/api/v1/organizations/${org.id}/repositories/${res.body.data.id}/pull-requests`)
      .set(auth(owner.accessToken));
    expect(prs.body.data).toHaveLength(2);
    const merged = prs.body.data.find((pr) => pr.number === 2);
    expect(merged.state).toBe('merged');
  });

  it('reports a 404 when the repository is not accessible', async () => {
    client.getRepository.mockRejectedValue(new GithubApiError(404, 'not found'));
    const res = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/private' });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('cannot access');
  });

  it('rejects invalid repository names', async () => {
    const res = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'not-a-full-name' });
    expect(res.status).toBe(400);
  });

  it('syncs metadata and refreshes pull requests', async () => {
    client.getRepository.mockResolvedValue(remoteRepo());
    client.listPullRequests.mockResolvedValue([]);
    const created = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/devforge' });

    client.getRepository.mockResolvedValue(remoteRepo({ stargazers_count: 99 }));
    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/repositories/${created.body.data.id}/sync`)
      .set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.stars).toBe(99);
    expect(client.listPullRequests).toHaveBeenCalledTimes(2);
  });

  it('lists branches, commits and issues live from GitHub', async () => {
    client.getRepository.mockResolvedValue(remoteRepo());
    client.listPullRequests.mockResolvedValue([]);
    const created = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/devforge' });
    const repoId = created.body.data.id;
    const base = `/api/v1/organizations/${org.id}/repositories/${repoId}`;

    client.listBranches.mockResolvedValue([
      { name: 'main', commit: { sha: 'abc123' }, protected: true },
    ]);
    const branches = await request(app).get(`${base}/branches`).set(auth(owner.accessToken));
    expect(branches.body.data).toEqual([{ name: 'main', sha: 'abc123', protected: true }]);

    client.listCommits.mockResolvedValue([
      {
        sha: 'c1',
        commit: { message: 'Initial', author: { name: 'Ada', date: '2026-08-01T00:00:00Z' } },
        html_url: 'https://github.com/acme/devforge/commit/c1',
      },
    ]);
    const commits = await request(app).get(`${base}/commits`).set(auth(owner.accessToken));
    expect(commits.body.data).toHaveLength(1);
    expect(commits.body.data[0].message).toBe('Initial');

    client.listIssues.mockResolvedValue([
      {
        number: 1,
        title: 'Bug',
        state: 'open',
        user: { login: 'ada' },
        labels: [],
        comments: 2,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: null,
        html_url: 'u',
      },
      {
        number: 2,
        title: 'A pull request',
        state: 'open',
        user: { login: 'ada' },
        labels: [],
        comments: 0,
        pull_request: {},
      },
    ]);
    const issues = await request(app).get(`${base}/issues`).set(auth(owner.accessToken));
    expect(issues.body.data).toHaveLength(1);
    expect(issues.body.data[0].title).toBe('Bug');
  });

  it('marks the connection expired when GitHub returns 401', async () => {
    client.getRepository.mockRejectedValue(new GithubApiError(401, 'bad credentials'));
    const res = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/devforge' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GITHUB_TOKEN_EXPIRED');
    const { rows } = await pool.query(
      'SELECT token_expires_at FROM github_connections WHERE user_id = $1',
      [owner.userId],
    );
    expect(rows[0].token_expires_at).not.toBeNull();
  });

  it('removes a repository from the organization', async () => {
    client.getRepository.mockResolvedValue(remoteRepo());
    client.listPullRequests.mockResolvedValue([]);
    const created = await request(app)
      .post(importUrl())
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/devforge' });
    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/repositories/${created.body.data.id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);
    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/repositories`)
      .set(auth(owner.accessToken));
    expect(list.body.data).toHaveLength(0);
  });

  it('requires repos.manage for writes', async () => {
    const outsider = await registerUser(app, mailer);
    await addOrgMember(pool, { orgId: org.id, userId: outsider.userId, role: 'viewer' });
    const res = await request(app)
      .post(importUrl())
      .set(auth(outsider.accessToken))
      .send({ fullName: 'acme/devforge' });
    expect(res.status).toBe(403);
  });
});

describe('webhooks', () => {
  let owner;
  let org;
  let repoId;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    org = await createOrg(pool, { ownerId: owner.userId, slug: `wh-${Date.now()}` });
    await connectUser(owner.userId);
    client.getRepository.mockResolvedValue(remoteRepo());
    client.listPullRequests.mockResolvedValue([]);
    const created = await request(app)
      .post(`/api/v1/organizations/${org.id}/repositories/import`)
      .set(auth(owner.accessToken))
      .send({ fullName: 'acme/devforge' });
    repoId = created.body.data.id;
  });

  const createWebhook = (events = ['push']) =>
    request(app)
      .post(`/api/v1/organizations/${org.id}/repositories/${repoId}/webhooks`)
      .set(auth(owner.accessToken))
      .send({ events });

  async function webhookSecret(webhookId) {
    const { rows } = await pool.query(
      'SELECT secret_encrypted FROM repository_webhooks WHERE id = $1',
      [webhookId],
    );
    return crypto.decrypt(rows[0].secret_encrypted);
  }

  function signed(body, secret) {
    const raw = Buffer.from(JSON.stringify(body));
    const digest = createHmac('sha256', secret).update(raw).digest('hex');
    return { raw, signature: `sha256=${digest}` };
  }

  it('registers a webhook on GitHub and stores the secret encrypted', async () => {
    client.createWebhook.mockResolvedValue({ id: 900 });
    const res = await createWebhook(['push', 'pull_request', 'issues']);
    expect(res.status).toBe(201);
    expect(res.body.data.githubWebhookId).toBe(900);
    expect(res.body.data.events).toEqual(['push', 'pull_request', 'issues']);
    expect(client.createWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'acme/devforge',
        events: ['push', 'pull_request', 'issues'],
        secret: expect.any(String),
      }),
    );
  });

  it('verifies the signature and syncs on a push event', async () => {
    client.createWebhook.mockResolvedValue({ id: 901 });
    const created = await createWebhook(['push']);
    const secret = await webhookSecret(created.body.data.id);
    const { raw, signature } = signed({ repository: { full_name: 'acme/devforge' } }, secret);

    const res = await request(app)
      .post(`/api/v1/webhooks/github/${repoId}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signature)
      .send(raw.toString('utf8'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true, event: 'push', synced: true });
    expect(client.getRepository).toHaveBeenCalledTimes(2);
    expect(client.getRepository).toHaveBeenLastCalledWith({
      token: 'gho_test_token',
      fullName: 'acme/devforge',
    });
  });

  it('rejects a request with a bad signature', async () => {
    client.createWebhook.mockResolvedValue({ id: 902 });
    await createWebhook(['push']);
    const res = await request(app)
      .post(`/api/v1/webhooks/github/${repoId}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(JSON.stringify({ repository: {} }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
  });

  it('acknowledges ping events without syncing', async () => {
    client.createWebhook.mockResolvedValue({ id: 903 });
    const created = await createWebhook(['push']);
    const secret = await webhookSecret(created.body.data.id);
    const { raw, signature } = signed({ zen: 'speak like a human' }, secret);

    const res = await request(app)
      .post(`/api/v1/webhooks/github/${repoId}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'ping')
      .set('X-Hub-Signature-256', signature)
      .send(raw.toString('utf8'));
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(client.getRepository).toHaveBeenCalledTimes(1);
  });

  it('deletes a webhook on GitHub and locally', async () => {
    client.createWebhook.mockResolvedValue({ id: 904 });
    client.deleteWebhook.mockResolvedValue(null);
    const created = await createWebhook(['push']);
    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/repositories/${repoId}/webhooks/${created.body.data.id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);
    expect(client.deleteWebhook).toHaveBeenCalledWith({
      token: 'gho_test_token',
      fullName: 'acme/devforge',
      webhookId: 904,
    });
    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/repositories/${repoId}/webhooks`)
      .set(auth(owner.accessToken));
    expect(list.body.data).toHaveLength(0);
  });
});
