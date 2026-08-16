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
import { notFound } from '../src/utils/errors.js';

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
        downloadPullRequestDiff: async () => ({
          repo: { full_name: 'acme/repo' },
          diff: 'diff --git a/x b/x\n@@ -1,2 +1,3 @@\n+added\n-removed\n',
        }),
        commitGeneratedFile: async () => ({ path: 'README.md', sha: 'sha-000', committed: true }),
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
      .send({ repositoryId: repo.id, type: 'readme' });

    expect(res.status).toBe(502);
    const { rows } = await pool.query('SELECT * FROM ai_jobs ORDER BY created_at DESC LIMIT 1');
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error).toBe('AI service rejected the job (HTTP 401)');
  });

  it('creates a code_review job from a pull request diff', async () => {
    const { owner, org, repo } = await seed();
    const diffDownload = vi.fn().mockResolvedValue({
      repo: { full_name: 'acme/repo' },
      diff: 'diff --git a/src/app.js b/src/app.js\n@@ -1,3 +1,4 @@\n+const ok = true;\n-const bad = false;\n',
    });
    buildApp({
      github: {
        downloadRepositoryArchive: async () => ({
          repo: { full_name: 'acme/repo' },
          response: { body: Buffer.from('tarball-bytes') },
        }),
        downloadPullRequestDiff: diffDownload,
      },
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'code_review', pullRequestNumber: 7 });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'accepted', type: 'code_review' });
    const { jobId } = res.body;

    expect(diffDownload).toHaveBeenCalledWith({ orgId: org.id, repoId: repo.id, prNumber: 7 });

    const { rows } = await pool.query('SELECT * FROM ai_jobs WHERE id = $1', [jobId]);
    expect(rows[0]).toMatchObject({
      organization_id: org.id,
      repository_id: repo.id,
      type: 'code_review',
      status: 'queued',
    });
    expect(rows[0].payload).toMatchObject({
      repository_name: 'repo',
      pull_request_number: 7,
    });
    expect(rows[0].payload.diff).toContain('diff --git a/src/app.js');

    expect(submitted).toHaveLength(1);
    const body = JSON.parse(submitted[0].options.body);
    expect(body).toMatchObject({
      job_id: jobId,
      type: 'code_review',
      organization_id: org.id,
      repository_id: repo.id,
    });
    expect(body.archive_url).toBeUndefined();
    expect(body.archive_token).toBeUndefined();
    expect(body.payload).toMatchObject({
      repository_name: 'repo',
      pull_request_number: 7,
      diff: expect.stringContaining('diff --git'),
    });
  });

  it('requires pullRequestNumber for code_review analyses', async () => {
    const { owner, org, repo } = await seed();

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'code_review' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the pull request diff cannot be found', async () => {
    const { owner, org, repo } = await seed();
    buildApp({
      github: {
        downloadRepositoryArchive: async () => ({
          repo: { full_name: 'acme/repo' },
          response: { body: Buffer.from('tarball-bytes') },
        }),
        downloadPullRequestDiff: async () => {
          throw notFound('Pull request #999 not found');
        },
      },
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, type: 'code_review', pullRequestNumber: 999 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
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

  it('filters analyses by type and pull request number', async () => {
    const { owner, org, repo } = await seed();
    const reviewId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await pool.query(
      `INSERT INTO ai_analyses (id, organization_id, repository_id, type, status, model, score, report)
       VALUES ($1, $2, $3, 'code_review', 'completed', 'test-model', $4, $5)`,
      [
        reviewId,
        org.id,
        repo.id,
        JSON.stringify({ score: 88 }),
        JSON.stringify({ summary: 'ok', pull_request_number: 7 }),
      ],
    );

    const res = await request(app)
      .get(
        `/api/v1/organizations/${org.id}/ai/analyses?repositoryId=${repo.id}&type=code_review&pullRequestNumber=7`,
      )
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: reviewId, type: 'code_review' });
    expect(res.body.data[0].report).toMatchObject({ pull_request_number: 7 });
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

describe('ai analysis approval', () => {
  async function insertDocsAnalysis({ orgId, repoId, analysisId, type = 'readme', status = 'completed', files }) {
    await pool.query(
      `INSERT INTO ai_analyses (id, organization_id, repository_id, type, status, model, score, report)
       VALUES ($1, $2, $3, $4, $5, 'test-model', $6, $7)`,
      [
        analysisId,
        orgId,
        repoId,
        type,
        status,
        JSON.stringify({ files: files.length }),
        JSON.stringify({ summary: 'ok', files }),
      ],
    );
  }

  it('commits an approved generated file to GitHub', async () => {
    const { owner, org, repo } = await seed();
    const analysisId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const commit = vi.fn().mockResolvedValue({ path: 'README.md', sha: 'sha-123', committed: true });
    buildApp({
      github: {
        downloadRepositoryArchive: async () => ({
          repo: { full_name: 'acme/repo' },
          response: { body: Buffer.from('tarball-bytes') },
        }),
        downloadPullRequestDiff: async () => ({ repo: { full_name: 'acme/repo' }, diff: '' }),
        commitGeneratedFile: commit,
      },
    });
    await insertDocsAnalysis({
      orgId: org.id,
      repoId: repo.id,
      analysisId,
      files: [{ path: 'README.md', content: '# Hello\n' }],
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses/${analysisId}/approve`)
      .set(auth(owner.accessToken))
      .send({ filePath: 'README.md' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      analysisId,
      path: 'README.md',
      sha: 'sha-123',
      committed: true,
    });
    expect(commit).toHaveBeenCalledWith({
      orgId: org.id,
      repoId: repo.id,
      path: 'README.md',
      content: '# Hello\n',
      message: 'docs: README.md — generated by DevForge',
    });

    const { rows } = await pool.query('SELECT report FROM ai_analyses WHERE id = $1', [analysisId]);
    expect(rows[0].report.approvals).toHaveLength(1);
    expect(rows[0].report.approvals[0]).toMatchObject({ path: 'README.md', sha: 'sha-123' });
  });

  it('uses a custom commit message when provided', async () => {
    const { owner, org, repo } = await seed();
    const analysisId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
    const commit = vi.fn().mockResolvedValue({ path: 'docs/api.md', sha: 'sha-456', committed: true });
    buildApp({
      github: {
        downloadRepositoryArchive: async () => ({
          repo: { full_name: 'acme/repo' },
          response: { body: Buffer.from('tarball-bytes') },
        }),
        downloadPullRequestDiff: async () => ({ repo: { full_name: 'acme/repo' }, diff: '' }),
        commitGeneratedFile: commit,
      },
    });
    await insertDocsAnalysis({
      orgId: org.id,
      repoId: repo.id,
      analysisId,
      type: 'docs',
      files: [{ path: 'docs/api.md', content: '# Api\n' }],
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses/${analysisId}/approve`)
      .set(auth(owner.accessToken))
      .send({ filePath: 'docs/api.md', message: 'docs: api reference' });

    expect(res.status).toBe(200);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'docs: api reference' }),
    );
  });

  it('rejects approving a file that is not in the report', async () => {
    const { owner, org, repo } = await seed();
    const analysisId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
    await insertDocsAnalysis({
      orgId: org.id,
      repoId: repo.id,
      analysisId,
      files: [{ path: 'docs/api.md', content: '# Api\n' }],
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses/${analysisId}/approve`)
      .set(auth(owner.accessToken))
      .send({ filePath: 'README.md' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('README.md');
  });

  it('rejects approving an analysis that is not docs/readme', async () => {
    const { owner, org, repo } = await seed();
    const analysisId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3';
    await pool.query(
      `INSERT INTO ai_analyses (id, organization_id, repository_id, type, status, model, score, report)
       VALUES ($1, $2, $3, 'analyzer', 'completed', 'test-model', $4, $5)`,
      [analysisId, org.id, repo.id, JSON.stringify({ overall: 80 }), JSON.stringify({ summary: 'ok' })],
    );

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses/${analysisId}/approve`)
      .set(auth(owner.accessToken))
      .send({ filePath: 'README.md' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects approval before the job completes', async () => {
    const { owner, org, repo } = await seed();
    const analysisId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4';
    await insertDocsAnalysis({
      orgId: org.id,
      repoId: repo.id,
      analysisId,
      status: 'queued',
      files: [{ path: 'README.md', content: '# Hello\n' }],
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses/${analysisId}/approve`)
      .set(auth(owner.accessToken))
      .send({ filePath: 'README.md' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 when the analysis does not exist', async () => {
    const { owner, org } = await seed();

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5/approve`)
      .set(auth(owner.accessToken))
      .send({ filePath: 'README.md' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('requires authentication to approve', async () => {
    const { org, repo } = await seed();
    const analysisId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6';
    await insertDocsAnalysis({
      orgId: org.id,
      repoId: repo.id,
      analysisId,
      files: [{ path: 'README.md', content: '# Hello\n' }],
    });

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/analyses/${analysisId}/approve`)
      .send({ filePath: 'README.md' });

    expect(res.status).toBe(401);
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

describe('ai conversations', () => {
  async function seedConversation({ owner, org, repo, title } = {}) {
    if (!owner || !org || !repo) {
      ({ owner, org, repo } = await seed());
    }
    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, title });
    return { owner, org, repo, conversation: res.body.data };
  }

  it('creates a conversation linked to a repository', async () => {
    const { owner, org, repo } = await seed();

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id, title: 'Understand this repo' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      organizationId: org.id,
      repositoryId: repo.id,
      userId: owner.userId,
      title: 'Understand this repo',
      messageCount: 0,
    });
    const { rows } = await pool.query(
      'SELECT * FROM ai_conversations WHERE id = $1',
      [res.body.data.id],
    );
    expect(rows[0]).toMatchObject({ repository_id: repo.id, user_id: owner.userId });
  });

  it('defaults the conversation title', async () => {
    const { owner, org, repo } = await seed();

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('New conversation');
  });

  it('lists conversations for a repository', async () => {
    const seeded = await seed();
    await seedConversation({ ...seeded, title: 'first' });
    await seedConversation({ ...seeded, title: 'second' });

    const res = await request(app)
      .get(`/api/v1/organizations/${seeded.org.id}/ai/conversations?repositoryId=${seeded.repo.id}`)
      .set(auth(seeded.owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((c) => c.title)).toEqual(['second', 'first']);
  });

  it('returns 404 when creating a conversation for a repo outside the org', async () => {
    const { owner, org } = await seed();
    const other = await createOrg(pool, {
      ownerId: owner.userId,
      slug: `ai-conv-other-${Date.now()}-${repoSeq}`,
    });
    const repo = await insertRepo(other.id);

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations`)
      .set(auth(owner.accessToken))
      .send({ repositoryId: repo.id });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('deletes a conversation owned by the user', async () => {
    const seeded = await seed();
    const { conversation } = await seedConversation(seeded);

    const res = await request(app)
      .delete(`/api/v1/organizations/${seeded.org.id}/ai/conversations/${conversation.id}`)
      .set(auth(seeded.owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    const { rowCount } = await pool.query('SELECT * FROM ai_conversations WHERE id = $1', [
      conversation.id,
    ]);
    expect(rowCount).toBe(0);
  });

  it('returns 404 when deleting a conversation of another user', async () => {
    const seeded = await seed();
    const { conversation } = await seedConversation(seeded);
    const other = await registerUser(app, mailer);
    await addOrgMember(pool, { orgId: seeded.org.id, userId: other.userId, role: 'developer' });

    const res = await request(app)
      .delete(`/api/v1/organizations/${seeded.org.id}/ai/conversations/${conversation.id}`)
      .set(auth(other.accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('ai assistant streaming', () => {
  function sseFetch(events) {
    return async (url, options) => {
      submitted.push({ url, options });
      const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
      };
    };
  }

  async function seedWithStream(events) {
    const seeded = await seed();
    buildApp({ fetchImpl: sseFetch(events) });
    const created = await request(app)
      .post(`/api/v1/organizations/${seeded.org.id}/ai/conversations`)
      .set(auth(seeded.owner.accessToken))
      .send({ repositoryId: seeded.repo.id, title: 'Chat' });
    return { ...seeded, conversation: created.body.data };
  }

  it('relays a streamed reply and persists user + assistant messages', async () => {
    const { owner, org, repo, conversation } = await seedWithStream([
      { type: 'sources', sources: [{ path: 'README.md', score: 0.9 }] },
      { type: 'delta', text: 'hello ' },
      { type: 'delta', text: 'world' },
      { type: 'done' },
    ]);

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations/${conversation.id}/stream`)
      .set(auth(owner.accessToken))
      .send({ content: 'What does this repo do?' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('"type":"sources"');
    expect(res.text).toContain('"type":"done"');

    expect(submitted).toHaveLength(1);
    const { url, options } = submitted[0];
    expect(url).toBe('http://localhost:5001/assistant/stream');
    expect(verifyJobToken(options.headers['X-Devforge-Job-Token'], AI_SECRET, 300, NOW)).toBe(
      'assistant',
    );
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      conversation_id: conversation.id,
      organization_id: org.id,
      repository_id: repo.id,
      repository_name: 'repo',
      messages: [{ role: 'user', content: 'What does this repo do?' }],
    });

    const { rows } = await pool.query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversation.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ role: 'user', content: 'What does this repo do?' });
    expect(rows[1]).toMatchObject({ role: 'assistant', content: 'hello world' });
    expect(rows[1].sources).toEqual([{ path: 'README.md', score: 0.9 }]);
  });

  it('passes the full conversation history to the AI service', async () => {
    const { owner, org, conversation } = await seedWithStream([
      { type: 'sources', sources: [] },
      { type: 'delta', text: 'ok' },
      { type: 'done' },
    ]);
    await pool.query(
      `INSERT INTO ai_messages (conversation_id, role, content)
       VALUES ($1, 'user', 'first question'), ($1, 'assistant', 'first answer')`,
      [conversation.id],
    );

    await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations/${conversation.id}/stream`)
      .set(auth(owner.accessToken))
      .send({ content: 'next question' });

    const body = JSON.parse(submitted[0].options.body);
    expect(body.messages).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'next question' },
    ]);
  });

  it('does not persist an assistant message when the model errors', async () => {
    const { owner, org, conversation } = await seedWithStream([
      { type: 'error', message: 'model stream failed' },
    ]);

    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations/${conversation.id}/stream`)
      .set(auth(owner.accessToken))
      .send({ content: 'hi' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('model stream failed');
    const { rows } = await pool.query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1',
      [conversation.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('user');
  });

  it('returns 502 when the AI service is unreachable', async () => {
    const seeded = await seed();
    buildApp({ fetchImpl: vi.fn().mockRejectedValue(new Error('connection refused')) });
    const created = await request(app)
      .post(`/api/v1/organizations/${seeded.org.id}/ai/conversations`)
      .set(auth(seeded.owner.accessToken))
      .send({ repositoryId: seeded.repo.id });

    const res = await request(app)
      .post(`/api/v1/organizations/${seeded.org.id}/ai/conversations/${created.body.data.id}/stream`)
      .set(auth(seeded.owner.accessToken))
      .send({ content: 'hi' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EXTERNAL_SERVICE_ERROR');
    const { rows } = await pool.query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1',
      [created.body.data.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('user');
  });

  it('returns 404 when streaming into a conversation outside the org', async () => {
    const seeded = await seed();
    const other = await createOrg(pool, {
      ownerId: seeded.owner.userId,
      slug: `ai-stream-other-${Date.now()}-${repoSeq}`,
    });
    const repo = await insertRepo(other.id);
    const res = await request(app)
      .post(`/api/v1/organizations/${other.id}/ai/conversations`)
      .set(auth(seeded.owner.accessToken))
      .send({ repositoryId: repo.id });
    const conversationId = res.body.data.id;

    const stream = await request(app)
      .post(`/api/v1/organizations/${seeded.org.id}/ai/conversations/${conversationId}/stream`)
      .set(auth(seeded.owner.accessToken))
      .send({ content: 'hi' });

    expect(stream.status).toBe(404);
    expect(stream.body.error.code).toBe('NOT_FOUND');
  });

  it('blocks a viewer from creating conversations or streaming', async () => {
    const seeded = await seed();
    const viewer = await registerUser(app, mailer);
    await addOrgMember(pool, { orgId: seeded.org.id, userId: viewer.userId, role: 'viewer' });

    const create = await request(app)
      .post(`/api/v1/organizations/${seeded.org.id}/ai/conversations`)
      .set(auth(viewer.accessToken))
      .send({ repositoryId: seeded.repo.id });
    expect(create.status).toBe(403);

    const list = await request(app)
      .get(`/api/v1/organizations/${seeded.org.id}/ai/conversations?repositoryId=${seeded.repo.id}`)
      .set(auth(viewer.accessToken));
    expect(list.status).toBe(200);

    const ownerRes = await request(app)
      .post(`/api/v1/organizations/${seeded.org.id}/ai/conversations`)
      .set(auth(seeded.owner.accessToken))
      .send({ repositoryId: seeded.repo.id });
    const stream = await request(app)
      .post(
        `/api/v1/organizations/${seeded.org.id}/ai/conversations/${ownerRes.body.data.id}/stream`,
      )
      .set(auth(viewer.accessToken))
      .send({ content: 'hi' });
    expect(stream.status).toBe(403);
  });

  it('requires authentication for conversation endpoints', async () => {
    const { org, repo } = await seed();

    const create = await request(app)
      .post(`/api/v1/organizations/${org.id}/ai/conversations`)
      .send({ repositoryId: repo.id });
    expect(create.status).toBe(401);

    const list = await request(app).get(
      `/api/v1/organizations/${org.id}/ai/conversations?repositoryId=${repo.id}`,
    );
    expect(list.status).toBe(401);
  });
});
