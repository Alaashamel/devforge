import request from 'supertest';
import { TEST_PASSWORD } from '../auth/helpers.js';

let seq = 0;

export function uniqueEmail(prefix = 'member') {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@devforge.test`;
}

export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function registerUser(app, mailer, { email = uniqueEmail(), name = 'Test User', password = TEST_PASSWORD } = {}) {
  await request(app).post('/api/v1/auth/register').send({ email, name, password });
  const message = mailer.sent.find((m) => m.kind === 'verification' && m.to === email);
  if (!message) {
    throw new Error(`no verification token captured for ${email}`);
  }
  await request(app).post('/api/v1/auth/verify-email').send({ token: message.token });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return {
    email,
    name,
    userId: res.body.data.user.id,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

export async function createOrg(pool, { ownerId, slug, name, plan = 'free' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO organizations (name, slug, owner_id, plan)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name ?? slug, slug, ownerId, plan],
  );
  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
     VALUES ($1, $2, 'owner', 'active', now())`,
    [rows[0].id, ownerId],
  );
  return rows[0];
}

export async function addOrgMember(pool, { orgId, userId, role = 'developer' }) {
  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
     VALUES ($1, $2, $3, 'active', now())`,
    [orgId, userId, role],
  );
}

export async function addProjectMember(pool, { projectId, userId, role = 'developer' }) {
  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`,
    [projectId, userId, role],
  );
}

export async function createProject(app, token, orgId, payload = {}) {
  return request(app)
    .post(`/api/v1/organizations/${orgId}/projects`)
    .set(auth(token))
    .send({ name: 'Test Project', key: 'TP', ...payload });
}

export async function createTask(app, token, orgId, projectId, payload = {}) {
  return request(app)
    .post(`/api/v1/organizations/${orgId}/projects/${projectId}/tasks`)
    .set(auth(token))
    .send({ title: 'Do the thing', ...payload });
}
