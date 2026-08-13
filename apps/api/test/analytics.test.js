import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
import { createAnalyticsService } from '../src/modules/analytics/service.js';

const FIXED_NOW = new Date('2026-08-13T12:00:00.000Z');

let pool;
let mailer;
let app;

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
  mailer = createCapturingMailer();
  const analytics = createAnalyticsService({ pool, now: () => FIXED_NOW });
  app = createTestApp({ pool, mailer, analytics });
  await pool.query('TRUNCATE users CASCADE');
});

let repoSeq = 0;
let connSeq = 0;

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

async function connectUser(userId, login = 'dev-user') {
  connSeq += 1;
  await pool.query(
    `INSERT INTO github_connections (user_id, github_user_id, github_login, access_token_encrypted, scopes)
     VALUES ($1, $2, $3, 'test-token', ARRAY['repo'])`,
    [userId, Date.now() % 100000 + connSeq, login],
  );
}

async function insertPr(repoId, { number, state = 'open', author = 'dev-user', additions = 10, deletions = 2, mergedAt = null, createdAt }) {
  const { rows } = await pool.query(
    `INSERT INTO pull_requests (repository_id, number, title, state, author, head_ref, base_ref, additions, deletions, merged_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'feat', 'main', $6, $7, $8, $9) RETURNING *`,
    [repoId, number, `PR #${number}`, state, author, additions, deletions, mergedAt, createdAt],
  );
  return rows[0];
}

async function insertProject(orgId, userId) {
  const { rows } = await pool.query(
    `INSERT INTO projects (organization_id, name, key, created_by)
     VALUES ($1, 'Analytics Fixture', 'ANL', $2) RETURNING *`,
    [orgId, userId],
  );
  return rows[0];
}

async function insertTask(projectId, { type = 'task', status = 'done', estimate = null, assigneeId, reporterId, updatedAt }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (project_id, type, status, priority, title, assignee_id, reporter_id, estimate, updated_at)
     VALUES ($1, $2, $3, 'medium', $4, $5, $6, $7, $8) RETURNING *`,
    [projectId, type, status, `Task ${status}`, assigneeId, reporterId, estimate, updatedAt],
  );
  return rows[0];
}

async function insertCompletedReview(repoId, pullRequestId, updatedAt) {
  await pool.query(
    `INSERT INTO code_reviews (repository_id, pull_request_id, status, summary, findings, severity_counts, model, created_at, updated_at)
     VALUES ($1, $2, 'completed', 'ok', $3, $4, 'gpt-4o-mini', $5, $5)`,
    [repoId, pullRequestId, [], {}, updatedAt],
  );
}

// Builds the standard fixture:
// - one repo with 5 PRs (2 merged in-window by a connected author, 1 merged
//   before the 4-week window, 1 closed, 1 open)
// - 3 tasks (2 done with estimates, 1 todo) and 1 completed AI review
async function seedFixture() {
  const owner = await registerUser(app, mailer);
  const org = await createOrg(pool, { ownerId: owner.userId, slug: `analytics-${Date.now()}-${repoSeq}` });
  const repo = await insertRepo(org.id);
  const project = await insertProject(org.id, owner.userId);
  await connectUser(owner.userId, 'dev-user');

  const prA = await insertPr(repo.id, { number: 1, state: 'merged', additions: 100, deletions: 10, mergedAt: new Date('2026-08-05T10:00:00.000Z'), createdAt: new Date('2026-07-25T10:00:00.000Z') });
  await insertPr(repo.id, { number: 2, state: 'merged', additions: 50, deletions: 5, mergedAt: new Date('2026-07-28T10:00:00.000Z'), createdAt: new Date('2026-07-15T10:00:00.000Z') });
  await insertPr(repo.id, { number: 3, state: 'merged', author: 'other-user', additions: 200, deletions: 40, mergedAt: new Date('2026-07-15T10:00:00.000Z'), createdAt: new Date('2026-07-02T10:00:00.000Z') });
  await insertPr(repo.id, { number: 4, state: 'closed', additions: 30, deletions: 3, createdAt: new Date('2026-07-30T10:00:00.000Z') });
  await insertPr(repo.id, { number: 5, state: 'open', additions: 20, deletions: 2, createdAt: new Date('2026-08-10T10:00:00.000Z') });

  await insertTask(project.id, { status: 'done', estimate: 3, assigneeId: owner.userId, reporterId: owner.userId, updatedAt: new Date('2026-08-06T10:00:00.000Z') });
  await insertTask(project.id, { type: 'issue', status: 'done', estimate: 2, assigneeId: owner.userId, reporterId: owner.userId, updatedAt: new Date('2026-07-29T10:00:00.000Z') });
  await insertTask(project.id, { status: 'todo', assigneeId: owner.userId, reporterId: owner.userId, updatedAt: new Date('2026-08-01T10:00:00.000Z') });

  await insertCompletedReview(repo.id, prA.id, new Date('2026-08-04T10:00:00.000Z'));

  return { owner, org, repo };
}

describe('analytics overview', () => {
  it('returns aggregated repository, PR and task counts for an organization', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/overview`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      repositories: 1,
      pullRequests: 5,
      prsByState: { open: 1, merged: 3, closed: 1 },
      additions: 400,
      deletions: 60,
      projects: 1,
      tasks: 3,
      tasksDone: 2,
    });
    expect(res.body.data.completionRatio).toBeCloseTo(2 / 3, 5);
  });

  it('ranks top contributors by merged pull requests', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/overview`)
      .set(auth(owner.accessToken));

    expect(res.body.data.topContributors).toEqual([
      { author: 'dev-user', merged: 2, additions: 150, deletions: 15 },
      { author: 'other-user', merged: 1, additions: 200, deletions: 40 },
    ]);
  });

  it('lists the most recently merged pull requests', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/overview`)
      .set(auth(owner.accessToken));

    const titles = res.body.data.recentMerged.map((pr) => pr.title);
    expect(titles).toEqual(['PR #1', 'PR #2', 'PR #3']);
    expect(res.body.data.recentMerged[0].repository).toBe('acme/repo');
  });
});

describe('analytics velocity', () => {
  it('buckets PR, task and review events into the weekly series', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/velocity?weeks=4`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.window).toEqual({
      start: '2026-07-20',
      end: '2026-08-10',
      weeks: 4,
    });
    expect(res.body.data.series).toEqual([
      { period: '2026-07-20', mergedPrs: 0, completedTasks: 0, issuesClosed: 0, reviewsCompleted: 0 },
      { period: '2026-07-27', mergedPrs: 1, completedTasks: 0, issuesClosed: 1, reviewsCompleted: 0 },
      { period: '2026-08-03', mergedPrs: 1, completedTasks: 1, issuesClosed: 0, reviewsCompleted: 1 },
      { period: '2026-08-10', mergedPrs: 0, completedTasks: 0, issuesClosed: 0, reviewsCompleted: 0 },
    ]);
    expect(res.body.data.totals).toEqual({
      mergedPrs: 2,
      completedTasks: 1,
      issuesClosed: 1,
      reviewsCompleted: 1,
    });
  });

  it('defaults to a 12 week window when weeks is omitted', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/velocity`)
      .set(auth(owner.accessToken));

    expect(res.body.data.window.weeks).toBe(12);
    expect(res.body.data.series).toHaveLength(12);
  });

  it('rejects out-of-range weeks with a 400', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/velocity?weeks=0`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('analytics health', () => {
  it('computes a weighted health score from the fixture', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/health`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(69);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.components.taskCompletion).toBeCloseTo(2 / 3, 5);
    expect(res.body.data.components.mergeRate).toBeCloseTo(0.75, 5);
    expect(res.body.data.components.issueCloseRate).toBe(1);
    expect(res.body.data.components.reviewCoverage).toBeCloseTo(0.2, 5);
  });

  it('reports healthy when everything is green', async () => {
    const owner = await registerUser(app, mailer);
    const org = await createOrg(pool, { ownerId: owner.userId, slug: `analytics-health-${Date.now()}-${repoSeq}` });
    const repo = await insertRepo(org.id);
    const project = await insertProject(org.id, owner.userId);
    const pr = await insertPr(repo.id, { number: 1, state: 'merged', mergedAt: new Date('2026-08-05T10:00:00.000Z'), createdAt: new Date('2026-07-25T10:00:00.000Z') });
    await insertTask(project.id, { status: 'done', estimate: 1, assigneeId: owner.userId, reporterId: owner.userId, updatedAt: new Date('2026-08-06T10:00:00.000Z') });
    await insertCompletedReview(repo.id, pr.id, new Date('2026-08-04T10:00:00.000Z'));

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/health`)
      .set(auth(owner.accessToken));

    expect(res.body.data.score).toBe(100);
    expect(res.body.data.status).toBe('healthy');
  });
});

describe('analytics developers', () => {
  it('aggregates per-developer metrics and materializes developer_metrics', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/developers?weeks=4`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.meta.developerMetrics).toBe(2);
    expect(res.body.data.developers).toHaveLength(1);
    expect(res.body.data.developers[0]).toMatchObject({
      userId: owner.userId,
      name: owner.name,
      tasksAssigned: 3,
      tasksCompleted: 2,
      velocityPoints: 5,
      mergedPrs: 2,
      additions: 150,
      deletions: 15,
      healthScore: 67,
    });

    const { rows: metrics } = await pool.query(
      'SELECT to_char(period, \'YYYY-MM-DD\') AS period, pull_requests, tasks_completed, velocity_points FROM developer_metrics WHERE organization_id = $1 ORDER BY period ASC',
      [org.id],
    );
    expect(metrics).toHaveLength(2);
    expect(metrics.map((m) => m.period)).toEqual(['2026-07-27', '2026-08-03']);
    expect(metrics[0]).toMatchObject({
      pull_requests: 1,
      tasks_completed: 1,
      velocity_points: 2,
    });
    expect(metrics[1]).toMatchObject({
      pull_requests: 1,
      tasks_completed: 1,
      velocity_points: 3,
    });
  });

  it('lists members with no recent activity as zeroed developers', async () => {
    const owner = await registerUser(app, mailer);
    const org = await createOrg(pool, { ownerId: owner.userId, slug: `analytics-zero-${Date.now()}-${repoSeq}` });

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/developers`)
      .set(auth(owner.accessToken));

    expect(res.body.data.developers).toHaveLength(1);
    expect(res.body.data.developers[0]).toMatchObject({
      tasksAssigned: 0,
      tasksCompleted: 0,
      velocityPoints: 0,
      mergedPrs: 0,
    });
    expect(res.body.data.developers[0].healthScore).toBeNull();
  });
});

describe('analytics repository views', () => {
  it('lists per-repository PR summaries for the organization', async () => {
    const { owner, org } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/repositories`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.repositories).toEqual([
      expect.objectContaining({
        fullName: 'acme/repo',
        totalPrs: 5,
        openPrs: 1,
        mergedPrs: 3,
        closedPrs: 1,
        additions: 400,
        deletions: 60,
      }),
    ]);
  });

  it('returns monthly activity, recent PRs and review counts for one repository', async () => {
    const { owner, org, repo } = await seedFixture();

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/repositories/${repo.id}/activity`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.repository).toMatchObject({ id: repo.id, fullName: 'acme/repo' });
    expect(res.body.data.monthly[0]).toMatchObject({
      period: '2026-08',
      created: 1,
      open: 1,
      merged: 0,
      closed: 0,
    });
    expect(res.body.data.monthly[1]).toMatchObject({
      period: '2026-07',
      created: 4,
      open: 0,
      merged: 3,
      closed: 1,
    });
    expect(res.body.data.reviews).toEqual({ completed: 1 });
    expect(res.body.data.recent).toHaveLength(5);
    expect(res.body.data.recent[0].title).toBe('PR #5');
  });

  it('returns 404 for a repository outside the organization', async () => {
    const owner = await registerUser(app, mailer);
    const org = await createOrg(pool, { ownerId: owner.userId, slug: `analytics-404-${Date.now()}-${repoSeq}` });
    const other = await createOrg(pool, { ownerId: owner.userId, slug: `analytics-other-${Date.now()}-${repoSeq}` });
    const repo = await insertRepo(other.id);

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/repositories/${repo.id}/activity`)
      .set(auth(owner.accessToken));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('analytics access control', () => {
  it('requires authentication', async () => {
    const { org } = await seedFixture();

    const res = await request(app).get(`/api/v1/organizations/${org.id}/analytics/overview`);

    expect(res.status).toBe(401);
  });

  it('allows a viewer member to read analytics', async () => {
    const { org } = await seedFixture();
    const viewer = await registerUser(app, mailer);
    await addOrgMember(pool, { orgId: org.id, userId: viewer.userId, role: 'viewer' });

    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/analytics/health`)
      .set(auth(viewer.accessToken));

    expect(res.status).toBe(200);
  });

  it('rejects a request for an organization the user cannot access', async () => {
    const user = await registerUser(app, mailer);

    const res = await request(app)
      .get('/api/v1/organizations/00000000-0000-4000-8000-00000000ffff/analytics/overview')
      .set(auth(user.accessToken));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
