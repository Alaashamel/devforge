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
import {
  auth,
  createOrg,
  createProject,
  createTask,
  registerUser,
} from './modules/helpers.js';

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

describe('milestones', () => {
  let owner;
  let org;
  let project;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    org = await createOrg(pool, { ownerId: owner.userId, slug: `milestones-${Date.now()}` });
    const res = await createProject(app, owner.accessToken, org.id, { key: 'MS' });
    project = res.body.data;
  });

  it('creates, lists and updates milestones with a task count', async () => {
    const create = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones`)
      .set(auth(owner.accessToken))
      .send({ title: 'Alpha', dueDate: '2026-06-30', status: 'active' });
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({ title: 'Alpha', dueDate: '2026-06-30', status: 'active' });

    await createTask(app, owner.accessToken, org.id, project.id, {
      title: 'Milestoned',
      milestoneId: create.body.data.id,
    });

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones`)
      .set(auth(owner.accessToken));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].taskCount).toBe(1);

    const update = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones/${create.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ status: 'completed' });
    expect(update.body.data.status).toBe('completed');
  });

  it('rejects an invalid date and deletes milestones', async () => {
    const create = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones`)
      .set(auth(owner.accessToken))
      .send({ title: 'Bad', dueDate: '06/30/2026' });
    expect(create.status).toBe(400);

    const good = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones`)
      .set(auth(owner.accessToken))
      .send({ title: 'Good' });
    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones/${good.body.data.id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);
  });

  it('requires projects.manage for writes', async () => {
    const outsider = await registerUser(app, mailer);
    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones`)
      .set(auth(outsider.accessToken))
      .send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });
});

describe('labels', () => {
  let owner;
  let org;
  let project;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    org = await createOrg(pool, { ownerId: owner.userId, slug: `labels-${Date.now()}` });
    const res = await createProject(app, owner.accessToken, org.id, { key: 'LB' });
    project = res.body.data;
  });

  it('creates, lists, updates and deletes labels with task counts', async () => {
    const create = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/labels`)
      .set(auth(owner.accessToken))
      .send({ name: 'backend', color: '#0ea5e9' });
    expect(create.status).toBe(201);

    await createTask(app, owner.accessToken, org.id, project.id, {
      title: 'Tagged',
      labels: [create.body.data.id],
    });

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/labels`)
      .set(auth(owner.accessToken));
    expect(list.body.data[0].taskCount).toBe(1);

    const update = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${project.id}/labels/${create.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ color: '#ef4444' });
    expect(update.body.data.color).toBe('#ef4444');

    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${project.id}/labels/${create.body.data.id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);
  });

  it('rejects duplicate names and bad colors', async () => {
    await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/labels`)
      .set(auth(owner.accessToken))
      .send({ name: 'dup' });
    const dup = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/labels`)
      .set(auth(owner.accessToken))
      .send({ name: 'dup' });
    expect(dup.status).toBe(409);

    const badColor = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/labels`)
      .set(auth(owner.accessToken))
      .send({ name: 'ok', color: 'red' });
    expect(badColor.status).toBe(400);
  });
});
