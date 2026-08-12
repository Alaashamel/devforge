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
  addProjectMember,
  auth,
  createOrg,
  createProject,
  createTask,
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

describe('tasks', () => {
  let owner;
  let dev;
  let org;
  let project;
  let milestone;
  let labels;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    dev = await registerUser(app, mailer, { email: uniqueEmail() });
    org = await createOrg(pool, { ownerId: owner.userId, slug: `tasks-${Date.now()}` });
    await addOrgMember(pool, { orgId: org.id, userId: dev.userId, role: 'developer' });
    const projectRes = await createProject(app, owner.accessToken, org.id, { key: 'TSK' });
    project = projectRes.body.data;
    await addProjectMember(pool, { projectId: project.id, userId: dev.userId, role: 'developer' });

    const milestoneRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/milestones`)
      .set(auth(owner.accessToken))
      .send({ title: 'Alpha', dueDate: '2026-12-31' });
    milestone = milestoneRes.body.data;

    const labelRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/labels`)
      .set(auth(owner.accessToken))
      .send({ name: 'backend', color: '#0ea5e9' });
    labels = [labelRes.body.data];
  });

  it('creates a task with defaults and reporter = current user', async () => {
    const res = await createTask(app, dev.accessToken, org.id, project.id, {
      title: 'Implement auth',
      description: 'Do it well',
      milestoneId: milestone.id,
      assigneeId: dev.userId,
      labels: [labels[0].id],
      priority: 'high',
      type: 'issue',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Implement auth',
      status: 'todo',
      type: 'issue',
      priority: 'high',
      milestoneId: milestone.id,
      assigneeId: dev.userId,
      reporterId: dev.userId,
      labels: [{ id: labels[0].id, name: 'backend' }],
    });
  });

  it('rejects a milestone, assignee or parent outside the project', async () => {
    const otherOrg = await createOrg(pool, { ownerId: owner.userId, slug: `other-${Date.now()}` });
    const otherProject = await createProject(app, owner.accessToken, otherOrg.id, { key: 'OTH' });
    const foreignMilestone = await request(app)
      .post(`/api/v1/organizations/${otherOrg.id}/projects/${otherProject.body.data.id}/milestones`)
      .set(auth(owner.accessToken))
      .send({ title: 'Foreign' });

    const badMilestone = await createTask(app, owner.accessToken, org.id, project.id, {
      milestoneId: foreignMilestone.body.data.id,
    });
    expect(badMilestone.status).toBe(409);

    const outsider = await registerUser(app, mailer, { email: uniqueEmail() });
    const badAssignee = await createTask(app, owner.accessToken, org.id, project.id, {
      assigneeId: outsider.userId,
    });
    expect(badAssignee.status).toBe(409);

    const badParent = await createTask(app, owner.accessToken, org.id, project.id, {
      parentId: foreignMilestone.body.data.id,
    });
    expect(badParent.status).toBe(409);
  });

  it('rejects labels from another project', async () => {
    const otherOrg = await createOrg(pool, { ownerId: owner.userId, slug: `lab-${Date.now()}` });
    const otherProject = await createProject(app, owner.accessToken, otherOrg.id, { key: 'LBL' });
    const otherLabel = await request(app)
      .post(`/api/v1/organizations/${otherOrg.id}/projects/${otherProject.body.data.id}/labels`)
      .set(auth(owner.accessToken))
      .send({ name: 'other' });
    const res = await createTask(app, owner.accessToken, org.id, project.id, {
      labels: [otherLabel.body.data.id],
    });
    expect(res.status).toBe(409);
  });

  it('lists tasks with filters, search, sort and pagination', async () => {
    await createTask(app, dev.accessToken, org.id, project.id, { title: 'Alpha task', status: 'todo', priority: 'high', assigneeId: dev.userId });
    await createTask(app, dev.accessToken, org.id, project.id, { title: 'Beta task', status: 'in_progress', priority: 'low', assigneeId: dev.userId, labels: [labels[0].id] });
    await createTask(app, dev.accessToken, org.id, project.id, { title: 'Gamma task', status: 'done', priority: 'medium', type: 'bug' });

    const byStatus = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks?status=in_progress`)
      .set(auth(owner.accessToken));
    expect(byStatus.body.data).toHaveLength(1);
    expect(byStatus.body.data[0].title).toBe('Beta task');

    const byLabel = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks?label=${labels[0].id}`)
      .set(auth(owner.accessToken));
    expect(byLabel.body.meta.total).toBe(1);

    const search = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks?q=gamma`)
      .set(auth(owner.accessToken));
    expect(search.body.data).toHaveLength(1);

    const byPriority = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks?priority=high`)
      .set(auth(owner.accessToken));
    expect(byPriority.body.data[0].title).toBe('Alpha task');

    const page = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks?page=1&pageSize=2`)
      .set(auth(owner.accessToken));
    expect(page.body.meta).toMatchObject({ total: 3, totalPages: 2 });

    const byAssignee = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks?assigneeId=${dev.userId}`)
      .set(auth(owner.accessToken));
    expect(byAssignee.body.meta.total).toBe(2);
  });

  it('logs activity for created and updated tasks', async () => {
    const created = await createTask(app, dev.accessToken, org.id, project.id, { title: 'Log me' });
    const taskId = created.body.data.id;

    const update = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${taskId}`)
      .set(auth(dev.accessToken))
      .send({ status: 'in_progress', priority: 'urgent', assigneeId: dev.userId });
    expect(update.status).toBe(200);

    const activity = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${taskId}/activity`)
      .set(auth(owner.accessToken));
    const actions = activity.body.data.map((a) => a.action);
    expect(actions).toContain('created');
    expect(actions).toContain('status_change');
    expect(actions).toContain('priority_change');
    expect(actions).toContain('assignee_change');
    expect(activity.body.data[0].createdAt).toBeTruthy();
  });

  it('enforces RBAC on task management', async () => {
    const viewer = await registerUser(app, mailer, { email: uniqueEmail() });
    await addOrgMember(pool, { orgId: org.id, userId: viewer.userId, role: 'viewer' });
    await addProjectMember(pool, { projectId: project.id, userId: viewer.userId, role: 'viewer' });

    const create = await createTask(app, viewer.accessToken, org.id, project.id, { title: 'Nope' });
    expect(create.status).toBe(403);

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks`)
      .set(auth(viewer.accessToken));
    expect(list.status).toBe(200);

    const outsider = await registerUser(app, mailer, { email: uniqueEmail() });
    const outsiderCreate = await createTask(app, outsider.accessToken, org.id, project.id, { title: 'Nope' });
    expect(outsiderCreate.status).toBe(403);
  });

  it('gets a single task with counts and labels', async () => {
    const created = await createTask(app, dev.accessToken, org.id, project.id, {
      title: 'Detail me',
      labels: [labels[0].id],
    });
    const res = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${created.body.data.id}`)
      .set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Detail me');
    expect(res.body.data.labels).toHaveLength(1);
  });

  it('soft-deletes a task', async () => {
    const created = await createTask(app, dev.accessToken, org.id, project.id, { title: 'Doomed' });
    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${created.body.data.id}`)
      .set(auth(dev.accessToken));
    expect(del.status).toBe(204);
    const get = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${created.body.data.id}`)
      .set(auth(owner.accessToken));
    expect(get.status).toBe(404);
  });

  it('replaces a task label set', async () => {
    const created = await createTask(app, dev.accessToken, org.id, project.id, { title: 'Label me' });
    const second = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/labels`)
      .set(auth(owner.accessToken))
      .send({ name: 'frontend' });

    const put = await request(app)
      .put(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${created.body.data.id}/labels`)
      .set(auth(dev.accessToken))
      .send({ labelIds: [labels[0].id, second.body.data.id] });
    expect(put.status).toBe(200);
    expect(put.body.data.labels).toHaveLength(2);

    const cleared = await request(app)
      .put(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${created.body.data.id}/labels`)
      .set(auth(dev.accessToken))
      .send({ labelIds: [] });
    expect(cleared.body.data.labels).toHaveLength(0);
  });
});

describe('task comments', () => {
  let owner;
  let dev;
  let org;
  let project;
  let task;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    dev = await registerUser(app, mailer, { email: uniqueEmail() });
    org = await createOrg(pool, { ownerId: owner.userId, slug: `comments-${Date.now()}` });
    await addOrgMember(pool, { orgId: org.id, userId: dev.userId, role: 'developer' });
    const projectRes = await createProject(app, owner.accessToken, org.id, { key: 'CMT' });
    project = projectRes.body.data;
    await addProjectMember(pool, { projectId: project.id, userId: dev.userId, role: 'developer' });
    const taskRes = await createTask(app, dev.accessToken, org.id, project.id, { title: 'Discuss me' });
    task = taskRes.body.data;
  });

  it('adds, lists and edits comments', async () => {
    const add = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments`)
      .set(auth(dev.accessToken))
      .send({ body: 'First!' });
    expect(add.status).toBe(201);
    expect(add.body.data.author.id).toBe(dev.userId);

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken));
    expect(list.body.data).toHaveLength(1);

    const edit = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments/${add.body.data.id}`)
      .set(auth(dev.accessToken))
      .send({ body: 'Edited by author' });
    expect(edit.body.data.body).toBe('Edited by author');
  });

  it('lets a manager edit but a stranger cannot', async () => {
    const add = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments`)
      .set(auth(dev.accessToken))
      .send({ body: 'Mine' });

    const manager = await registerUser(app, mailer, { email: uniqueEmail() });
    await addOrgMember(pool, { orgId: org.id, userId: manager.userId, role: 'maintainer' });
    await addProjectMember(pool, { projectId: project.id, userId: manager.userId, role: 'maintainer' });
    const managerEdit = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments/${add.body.data.id}`)
      .set(auth(manager.accessToken))
      .send({ body: 'Manager edit' });
    expect(managerEdit.status).toBe(200);

    const stranger = await registerUser(app, mailer, { email: uniqueEmail() });
    await addOrgMember(pool, { orgId: org.id, userId: stranger.userId, role: 'viewer' });
    await addProjectMember(pool, { projectId: project.id, userId: stranger.userId, role: 'viewer' });
    const strangerEdit = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments/${add.body.data.id}`)
      .set(auth(stranger.accessToken))
      .send({ body: 'Nope' });
    expect(strangerEdit.status).toBe(403);
  });

  it('deletes a comment (author only or manager)', async () => {
    const add = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments`)
      .set(auth(dev.accessToken))
      .send({ body: 'Bye' });
    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.id}/comments/${add.body.data.id}`)
      .set(auth(dev.accessToken));
    expect(del.status).toBe(204);
  });
});

describe('task dependencies', () => {
  let owner;
  let org;
  let project;

  beforeEach(async () => {
    owner = await registerUser(app, mailer);
    org = await createOrg(pool, { ownerId: owner.userId, slug: `deps-${Date.now()}` });
    const projectRes = await createProject(app, owner.accessToken, org.id, { key: 'DEP' });
    project = projectRes.body.data;
  });

  it('creates, lists and removes dependencies', async () => {
    const a = await createTask(app, owner.accessToken, org.id, project.id, { title: 'Blocked' });
    const b = await createTask(app, owner.accessToken, org.id, project.id, { title: 'Blocker' });

    const create = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${a.body.data.id}/dependencies`)
      .set(auth(owner.accessToken))
      .send({ dependsOnId: b.body.data.id });
    expect(create.status).toBe(201);

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${a.body.data.id}/dependencies`)
      .set(auth(owner.accessToken));
    expect(list.body.data.dependsOn).toHaveLength(1);
    expect(list.body.data.dependsOn[0].title).toBe('Blocker');
    expect(list.body.data.dependedOnBy).toHaveLength(0);

    const reverse = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${b.body.data.id}/dependencies`)
      .set(auth(owner.accessToken));
    expect(reverse.body.data.dependedOnBy).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${a.body.data.id}/dependencies/${b.body.data.id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);
  });

  it('rejects self and cross-project dependencies', async () => {
    const a = await createTask(app, owner.accessToken, org.id, project.id, { title: 'Selfish' });
    const self = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${a.body.data.id}/dependencies`)
      .set(auth(owner.accessToken))
      .send({ dependsOnId: a.body.data.id });
    expect(self.status).toBe(409);

    const otherOrg = await createOrg(pool, { ownerId: owner.userId, slug: `odep-${Date.now()}` });
    const otherProject = await createProject(app, owner.accessToken, otherOrg.id, { key: 'DEPO' });
    const otherTask = await createTask(app, owner.accessToken, otherOrg.id, otherProject.body.data.id, { title: 'Foreign' });
    const foreign = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${a.body.data.id}/dependencies`)
      .set(auth(owner.accessToken))
      .send({ dependsOnId: otherTask.body.data.id });
    expect(foreign.status).toBe(409);
  });

  it('rejects a dependency that would close a cycle', async () => {
    const a = await createTask(app, owner.accessToken, org.id, project.id, { title: 'A' });
    const b = await createTask(app, owner.accessToken, org.id, project.id, { title: 'B' });

    const first = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${a.body.data.id}/dependencies`)
      .set(auth(owner.accessToken))
      .send({ dependsOnId: b.body.data.id });
    expect(first.status).toBe(201);

    const cycle = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${b.body.data.id}/dependencies`)
      .set(auth(owner.accessToken))
      .send({ dependsOnId: a.body.data.id });
    expect(cycle.status).toBe(409);

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${b.body.data.id}/dependencies`)
      .set(auth(owner.accessToken));
    expect(list.body.data.dependsOn).toHaveLength(0);
  });

  it('rejects a transitive dependency cycle', async () => {
    const a = await createTask(app, owner.accessToken, org.id, project.id, { title: 'A' });
    const b = await createTask(app, owner.accessToken, org.id, project.id, { title: 'B' });
    const c = await createTask(app, owner.accessToken, org.id, project.id, { title: 'C' });

    for (const [task, dependsOn] of [
      [a, b],
      [b, c],
    ]) {
      const res = await request(app)
        .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${task.body.data.id}/dependencies`)
        .set(auth(owner.accessToken))
        .send({ dependsOnId: dependsOn.body.data.id });
      expect(res.status).toBe(201);
    }

    const cycle = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${project.id}/tasks/${c.body.data.id}/dependencies`)
      .set(auth(owner.accessToken))
      .send({ dependsOnId: a.body.data.id });
    expect(cycle.status).toBe(409);
  });
});
