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
import { createAiService } from '../src/modules/ai/service.js';
import { signArchiveToken, verifyJobToken } from '../src/modules/ai/tokens.js';

const AI_SECRET = 'devforge-test-ai-job-secret-000000000000';
const NOW = () => new Date('2026-08-15T10:00:00.000Z');

let pool;
let mailer;
let app;
let submitted;

function buildApp({ fetchImpl, github } = {}) {
  mailer = createCapturingMailer();
  const ai = createAiService({
    pool,
    github:
      github ??
      {
        downloadRepositoryArchive: async () => ({
          repo: { full_name: 'acme/repo' },
          response: { body: Buffer.from('tarball-bytes') },
        }),
      },
    aiServiceUrl: 'http://localhost:5001',
    jobSecret: AI_SECRET,
    jobTokenTtlSeconds: 300,
    archiveTokenTtlSeconds: 900,
    apiBaseUrl: 'http://localhost:4000',
    fetchImpl:
      fetchImpl ??
      (async (url, options) => {
        submitted.push({ url, options });
        return { ok: true, status: 202 };
      }),
    now: NOW,
  });
  app = createTestApp({ pool, mailer, ai });
}

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
  submitted = [];
  buildApp();
  await pool.query('TRUNCATE users CASCADE');
});

let repoSeq = 0;

async function insertRepo(orgId, name = 'repo') {
  repoSeq += 1;
  const { rows } = await pool.query(
    `INSERT INTO repositories (organization_id, github_repo_id, name, full_name, url, default_branch)
     VALUES ($1, $2, $3, $4, $5, 'main') RETURNING *`,
    [
      orgId,
      Date.now() + repoSeq,
      name,
      `acme/${name}`,
      `https://github.com/acme/${name}`,
    ],
  );
  return rows[0];
}

async function seed() {
  const owner = await registerUser(app, mailer);
  const org = await createOrg(pool, {
    ownerId: owner.userId,
    slug: `ai-${Date.now()}-${repoSeq}`,
  });
  const repo = await insertRepo(org.id);
  return { owner, org, repo };
}

describe('ai job submission', () => {
  it('creates a queued job and submits a signed intent to the AI service', async () => {
    const { owner, org, repo } = await seed();

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'architecture' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'accepted', type: 'architecture' });
    const { jobId } = res.body;

    const { rows } = await pool.query('SELECT * FROM ai_jobs WHERE id = $1', [jobId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: org.id,
      repository_id: repo.id,
      type: 'architecture',
      status: 'queued',
    });

    expect(submitted).toHaveLength(1);
    const { url, options } = submitted[0];
    expect(url).toBe(`http://localhost:5001/jobs/${jobId}`);
    expect(verifyJobToken(options.headers['X-Devforge-Job-Token'], AI_SECRET, 300, NOW)).toBe(jobId);

    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      job_id: jobId,
      type: 'architecture',
      organization_id: org.id,
      repository_id: repo.id,
    });
    expect(body.archive_url).toBe(
      `http://localhost:4000/api/v1/ai/archive/${repo.id}?token=${encodeURIComponent(body.archive_token)}`,
    );
  });

  it('accepts the analyzer type and signs a matching intent', async () => {
    const { owner, org, repo } = await seed();

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'analyzer' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'accepted', type: 'analyzer' });
    expect(submitted).toHaveLength(1);
    expect(JSON.parse(submitted[0].options.body).type).toBe('analyzer');
  });

  it('rejects an invalid analysis type with a validation error', async () => {
    const { owner, org, repo } = await seed();

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'whisper' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the repository is not in the organization', async () => {
    const { owner, org } = await seed();
    const other = await createOrg(pool, {
      ownerId: owner.userId,
      slug: `ai-other-${Date.now()}-${repoSeq}`,
    });
    const repo = await insertRepo(other.id);

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'readme' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('marks the job failed and returns 502 when the AI service is unreachable', async () => {
    const { owner, org, repo } = await seed();
    buildApp({
      fetchImpl: vi.fn().mockRejectedValue(new Error('connection refused')),
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'docs' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EXTERNAL_SERVICE_ERROR');

    const { rows } = await pool.query('SELECT * FROM ai_jobs ORDER BY created_at DESC LIMIT 1');
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error).toBe('AI service unreachable');
  });

  it('marks the job failed when the AI service rejects the intent', async () => {
    const { owner, org, repo } = await seed();
    buildApp({
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'code_review' });

    expect(res.status).toBe(502);
    const { rows } = await pool.query('SELECT * FROM ai_jobs ORDER BY created_at DESC LIMIT 1');
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error).toBe('AI service rejected the job (HTTP 401)');
  });
});

describe('ai job status and analyses', () => {
  it('returns the status of a job once the AI service completes it', async () => {
    const { owner, org, repo } = await seed();

    const created = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'readme' });
    const { jobId } = created.body;

    await pool.query(
      "UPDATE ai_jobs SET status = 'succeeded', result = $2, updated_at = now() WHERE id = $1",
      [jobId, JSON.stringify({ score: 82 })],
    );

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/ai/jobs/${jobId}`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: jobId,
      type: 'readme',
      status: 'succeeded',
      result: { score: 82 },
    });
  });

  it('returns 404 for a job outside the organization', async () => {
    const owner = await registerUser(app, mailer);
    const org = await createOrg(pool, { ownerId: owner.userId, slug: `ai-j404-${Date.now()}` });

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/ai/jobs/00000000-0000-4000-8000-000000000000`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('lists completed analyses for a repository', async () => {
    const { owner, org, repo } = await seed();
    const analysisId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await pool.query(
      `INSERT INTO ai_analyses (id, organization_id, repository_id, type, status, model, score, report)
       VALUES ($1, $2, $3, 'architecture', 'completed', 'test-model', $4, $5)`,
      [analysisId, org.id, repo.id, JSON.stringify({ overall: 78 }), JSON.stringify({ summary: 'ok' })],
    );

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/ai/analyses?repositoryId=${repo.id}`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: analysisId,
      type: 'architecture',
      status: 'completed',
      model: 'test-model',
      score: { overall: 78 },
    });
  });

  it('returns a single analysis by id', async () => {
    const { owner, org, repo } = await seed();
    const analysisId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await pool.query(
      `INSERT INTO ai_analyses (id, organization_id, repository_id, type, status, score, report)
       VALUES ($1, $2, $3, 'analyzer', 'completed', $4, $5)`,
      [analysisId, org.id, repo.id, JSON.stringify({ overall: 81 }), JSON.stringify({ summary: 'ok' })],
    );

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/ai/analyses/${analysisId}`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: analysisId,
      type: 'analyzer',
      status: 'completed',
      score: { overall: 81 },
    });
  });

  it('returns 404 for an analysis outside the organization', async () => {
    const { owner, org } = await seed();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/ai/analyses/cccccccc-cccc-4ccc-8ccc-cccccccccccc`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('ai archive streaming', () => {
  it('streams the repository archive to the AI service', async () => {
    const { repo } = await seed();
    const token = signArchiveToken(repo.id, AI_SECRET, 900, NOW);

    const res = await request(app)
      .get(`/api/v1/ai/archive/${repo.id}?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/x-tar');
    expect(res.text).toBe('tarball-bytes');
  });

  it('rejects a missing or tampered archive token', async () => {
    const { repo } = await seed();

    const missing = await request(app).get(`/api/v1/ai/archive/${repo.id}`);
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('INVALID_ARCHIVE_TOKEN');

    const tampered = await request(app).get(
      `/api/v1/ai/archive/${repo.id}?token=${encodeURIComponent('123.tampered')}`,
    );
    expect(tampered.status).toBe(401);
    expect(tampered.body.error.code).toBe('INVALID_ARCHIVE_TOKEN');
  });

  it('returns 404 for an unknown repository even with a valid token', async () => {
    await seed();
    const otherRepo = '00000000-0000-4000-8000-000000000000';
    const token = signArchiveToken(otherRepo, AI_SECRET, 900, NOW);

    const res = await request(app)
      .get(`/api/v1/ai/archive/${otherRepo}?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('ai access control', () => {
  it('requires authentication for job submission and reads', async () => {
    const { org, repo } = await seed();

    const post = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .send({ repositoryId: repo.id, type: 'readme' });
    expect(post.status).toBe(401);

    const list = await request(app).get(`/api/v1/organizations/${org.id}/ai/analyses`);
    expect(list.status).toBe(401);
  });

  it('allows a developer member to run an analysis', async () => {
    const { org, repo } = await seed();
    const developer = await registerUser(app, mailer);
    await addOrgMember(pool, { orgId: org.id, userId: developer.userId, role: 'developer' });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(developer.accessToken))
      .send({ repositoryId: repo.id, type: 'architecture' });

    expect(res.status).toBe(202);
  });

  it('blocks a viewer from running an analysis but allows reading', async () => {
    const { org, repo } = await seed();
    const viewer = await registerUser(app, mailer);
    await addOrgMember(pool, { orgId: org.id, userId: viewer.userId, role: 'viewer' });

    const post = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(viewer.accessToken))
      .send({ repositoryId: repo.id, type: 'readme' });
    expect(post.status).toBe(403);
    expect(post.body.error.code).toBe('FORBIDDEN');

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(viewer.accessToken));
    expect(list.status).toBe(200);
  });

  it('rejects a request for an organization the user cannot access', async () => {
    const user = await registerUser(app, mailer);

    const res = await request(app)
      .post('/api/v1/organizations/00000000-0000-4000-8000-0000000000ff/ai/analyses')
      .set(auth(user.accessToken))
      .send({ repositoryId: '00000000-0000-4000-8000-000000000000', type: 'readme' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
