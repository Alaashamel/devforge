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
  addOrgMember,
  auth,
  createOrg,
  createProject,
  registerUser,
  uniqueEmail,
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

describe('GET /api/v1/organizations', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/organizations');
    expect(res.status).toBe(401);
  });

  it('lists orgs the user owns or actively belongs to', async () => {
    const owner = await registerUser(app, mailer);
    const member = await registerUser(app, mailer, { email: uniqueEmail() });
    const org = await createOrg(pool, { ownerId: owner.userId, slug: 'alpha-org' });
    await addOrgMember(pool, { orgId: org.id, userId: member.userId, role: 'admin' });

    const ownerRes = await request(app)
      .get('/api/v1/organizations')
      .set(auth(owner.accessToken));
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data).toHaveLength(1);
    expect(ownerRes.body.data[0]).toMatchObject({ slug: 'alpha-org', role: 'owner' });

    const memberRes = await request(app)
      .get('/api/v1/organizations')
      .set(auth(member.accessToken));
    expect(memberRes.body.data[0].role).toBe('admin');
  });

  it('hides orgs the user does not belong to', async () => {
    const a = await registerUser(app, mailer);
    const b = await registerUser(app, mailer, { email: uniqueEmail() });
    await createOrg(pool, { ownerId: a.userId, slug: 'only-a' });
    const res = await request(app).get('/api/v1/organizations').set(auth(b.accessToken));
    expect(res.body.data).toHaveLength(0);
  });
});

describe('projects CRUD', () => {
  let owner;
  let org;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    org = await createOrg(pool, { ownerId: owner.userId, slug: `org-${Date.now()}` });
  });

  it('creates a project and makes the creator its owner', async () => {
    const res = await createProject(app, owner.accessToken, org.id, {
      name: 'Platform',
      key: 'plat',
      description: 'Core platform',
      defaultPriority: 'high',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Platform',
      key: 'PLAT',
      status: 'active',
      defaultPriority: 'high',
    });
    const { rows } = await pool.query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [res.body.data.id, owner.userId],
    );
    expect(rows[0].role).toBe('owner');
  });

  it('rejects a duplicate key within the org with 409', async () => {
    await createProject(app, owner.accessToken, org.id, { key: 'DUP' });
    const res = await createProject(app, owner.accessToken, org.id, { key: 'dup', name: 'Other' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('validates key and rejects unknown body keys', async () => {
    const bad = await createProject(app, owner.accessToken, org.id, { key: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const extra = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects`)
      .set(auth(owner.accessToken))
      .send({ name: 'X', key: 'XY', admin: true });
    expect(extra.status).toBe(400);
  });

  it('forbids an unknown org with 403', async () => {
    const res = await createProject(app, owner.accessToken, '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(403);
  });

  it('forbids creation by a non-member or viewer', async () => {
    const outsider = await registerUser(app, mailer, { email: uniqueEmail() });
    const viewer = await registerUser(app, mailer, { email: uniqueEmail() });
    await addOrgMember(pool, { orgId: org.id, userId: viewer.userId, role: 'viewer' });

    const outsiderRes = await createProject(app, outsider.accessToken, org.id);
    expect(outsiderRes.status).toBe(403);

    const viewerRes = await createProject(app, viewer.accessToken, org.id);
    expect(viewerRes.status).toBe(403);
  });

  it('lists projects with pagination, search and status filter', async () => {
    await createProject(app, owner.accessToken, org.id, { name: 'Alpha App', key: 'AA' });
    await createProject(app, owner.accessToken, org.id, { name: 'Beta App', key: 'BB' });
    await createProject(app, owner.accessToken, org.id, { name: 'Gamma App', key: 'GG' });

    const page = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects?page=1&pageSize=2`)
      .set(auth(owner.accessToken));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });

    const search = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects?q=beta`)
      .set(auth(owner.accessToken));
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].key).toBe('BB');

    await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${search.body.data[0].id}`)
      .set(auth(owner.accessToken))
      .send({ status: 'archived' });
    const active = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects?status=active`)
      .set(auth(owner.accessToken));
    expect(active.body.meta.total).toBe(2);
  });

  it('allows members to view but only managers to change a project', async () => {
    const developer = await registerUser(app, mailer, { email: uniqueEmail() });
    await addOrgMember(pool, { orgId: org.id, userId: developer.userId, role: 'developer' });
    const project = await createProject(app, owner.accessToken, org.id, { key: 'VW' });
    const id = project.body.data.id;

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${id}`)
      .set(auth(developer.accessToken));
    expect(list.status).toBe(200);

    const update = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${id}`)
      .set(auth(developer.accessToken))
      .send({ name: 'Hijacked' });
    expect(update.status).toBe(403);
  });

  it('updates project metadata', async () => {
    const project = await createProject(app, owner.accessToken, org.id, { key: 'UP' });
    const res = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${project.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ name: 'Renamed', description: null, defaultPriority: 'urgent' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Renamed', description: null, defaultPriority: 'urgent' });
  });

  it('soft-deletes a project (archive) and hides it from lists', async () => {
    const project = await createProject(app, owner.accessToken, org.id, { key: 'DEL' });
    const id = project.body.data.id;
    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);

    const get = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${id}`)
      .set(auth(owner.accessToken));
    expect(get.status).toBe(404);

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects`)
      .set(auth(owner.accessToken));
    expect(list.body.meta.total).toBe(0);
  });
});

describe('project members', () => {
  let owner;
  let org;
  let project;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    org = await createOrg(pool, { ownerId: owner.userId, slug: `members-${Date.now()}` });
    const res = await createProject(app, owner.accessToken, org.id, { key: 'MEM' });
    project = res.body.data;
  });

  it('adds, lists and removes members', async () => {
    const dev = await registerUser(app, mailer, { email: uniqueEmail() });

    const put = await request(app)
      .put(`/api/v1/organizations/${org.id}/projects/${project.id}/members/${dev.userId}`)
      .set(auth(owner.accessToken))
      .send({ role: 'developer' });
    expect(put.status).toBe(200);
    expect(put.body.data.role).toBe('developer');

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/members`)
      .set(auth(owner.accessToken));
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.map((m) => m.userId)).toContain(dev.userId);

    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${project.id}/members/${dev.userId}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);
  });

  it('adds an unknown user with 404', async () => {
    const res = await request(app)
      .put(`/api/v1/organizations/${org.id}/projects/${project.id}/members/00000000-0000-0000-0000-000000000000`)
      .set(auth(owner.accessToken))
      .send({ role: 'developer' });
    expect(res.status).toBe(404);
  });

  it('refuses to remove the last project owner', async () => {
    const res = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${project.id}/members/${owner.userId}`)
      .set(auth(owner.accessToken));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
