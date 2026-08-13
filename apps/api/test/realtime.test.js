import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import pg from 'pg';
import request from 'supertest';
import { io as createClient } from 'socket.io-client';
import { migrateUp } from '@devforge/database';
import {
  createCapturingMailer,
  createTestApp,
  ensureTestDatabase,
  TEST_DATABASE_URL,
} from './auth/helpers.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createPasswordService } from '../src/modules/auth/password.js';
import { createAccessTokenService } from '../src/modules/auth/tokens.js';
import { createRealtimeHub } from '../src/modules/realtime/index.js';
import { addOrgMember, addProjectMember, auth, createOrg, createProject, createTask, registerUser } from './modules/helpers.js';

const TEST_SECRET = 'a'.repeat(40);

let pool;
let mailer;
let app;
let server;
let realtime;
let baseUrl;
let clients = [];

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
  await pool.query('TRUNCATE users CASCADE');
  mailer = createCapturingMailer();
  const accessTokens = createAccessTokenService({ secret: TEST_SECRET, ttl: '15m' });
  const authService = createAuthService({
    pool,
    password: createPasswordService({ memoryCost: 8192, timeCost: 1, parallelism: 1 }),
    accessTokens,
    mailer,
    refreshTtlDays: 7,
  });
  realtime = createRealtimeHub({
    pool,
    accessTokens,
    resolveRole: authService.resolveEffectiveRole,
  });
  app = createTestApp({ pool, mailer, realtime });
  server = createServer(app);
  realtime.attach({ server });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  for (const client of clients) {
    client.disconnect();
  }
  clients = [];
  realtime.close();
  await new Promise((resolve) => server.close(resolve));
});

function connectClient(token) {
  const socket = createClient(`${baseUrl}/realtime`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  return socket;
}

function waitConnect(socket, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    const timer = setTimeout(() => reject(new Error('timeout connecting socket')), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitEvent(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    function onEvent(payload) {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    }
    socket.on(event, onEvent);
  });
}

function ackEmit(socket, event, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

describe('realtime hub', () => {
  it('rejects a handshake with a missing or invalid token', async () => {
    const socket = connectClient('not-a-real-token');
    const err = await waitEvent(socket, 'connect_error', 5000).catch((e) => e);
    expect(err.message).toBe('unauthorized');
    socket.disconnect();
  });

  it('rejects joining rooms the user has no access to', async () => {
    const alice = await registerUser(app, mailer);
    const bob = await registerUser(app, mailer, { email: `bob-reject@devforge.test` });
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'reject-org' });
    const project = await createProject(app, alice.accessToken, org.id);
    const bobSocket = connectClient(bob.accessToken);
    await waitConnect(bobSocket);

    const result = await ackEmit(bobSocket, 'room:join', { room: `project:${project.body.data.id}` });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('forbidden');

    const orgResult = await ackEmit(bobSocket, 'room:join', { room: `org:${org.id}` });
    expect(orgResult.ok).toBe(false);
    expect(orgResult.error).toBe('forbidden');

    const userRoom = await ackEmit(bobSocket, 'room:join', { room: `user:${alice.userId}` });
    expect(userRoom.ok).toBe(false);
    expect(userRoom.error).toBe('forbidden');
  });

  it('allows members to join project, org and chat rooms', async () => {
    const alice = await registerUser(app, mailer);
    const bob = await registerUser(app, mailer, { email: `bob-join@devforge.test` });
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'join-org' });
    await addOrgMember(pool, { orgId: org.id, userId: bob.userId });
    const project = await createProject(app, alice.accessToken, org.id);
    await addProjectMember(pool, { projectId: project.body.data.id, userId: bob.userId });

    const bobSocket = connectClient(bob.accessToken);
    await waitConnect(bobSocket);

    for (const room of [
      `org:${org.id}`,
      `project:${project.body.data.id}`,
      `chat:${org.id}`,
      `user:${bob.userId}`,
    ]) {
      const result = await ackEmit(bobSocket, 'room:join', { room });
      expect(result.ok).toBe(true);
    }
  });

  it('broadcasts presence updates to members in the org room', async () => {
    const alice = await registerUser(app, mailer);
    const bob = await registerUser(app, mailer, { email: `bob-presence@devforge.test` });
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'presence-org' });
    await addOrgMember(pool, { orgId: org.id, userId: bob.userId });

    const bobSocket = connectClient(bob.accessToken);
    await waitConnect(bobSocket);
    await ackEmit(bobSocket, 'room:join', { room: `org:${org.id}` });

    const aliceSocket = connectClient(alice.accessToken);
    await waitConnect(aliceSocket);
    const presencePromise = waitEvent(bobSocket, 'presence:update');
    const result = await ackEmit(aliceSocket, 'presence:join', { orgId: org.id, status: 'online' });
    expect(result.ok).toBe(true);
    expect(result.online).toHaveLength(0);

    const presence = await presencePromise;
    expect(presence.userId).toBe(alice.userId);
    expect(presence.status).toBe('online');
  });
});

describe('live task events and notifications', () => {
  it('emits task:created to the project room and records activity', async () => {
    const alice = await registerUser(app, mailer);
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'live-org' });
    const project = await createProject(app, alice.accessToken, org.id);
    const projectId = project.body.data.id;

    const aliceSocket = connectClient(alice.accessToken);
    await waitConnect(aliceSocket);
    await ackEmit(aliceSocket, 'room:join', { room: `project:${projectId}` });

    const createdPromise = waitEvent(aliceSocket, 'task:created');
    const res = await createTask(app, alice.accessToken, org.id, projectId, { title: 'Live task' });
    expect(res.status).toBe(201);

    const event = await createdPromise;
    expect(event.task.title).toBe('Live task');
    expect(event.task.status).toBe('todo');

    const activityRes = await request(app)
      .get(`/api/v1/organizations/${org.id}/activity`)
      .set(auth(alice.accessToken));
    expect(activityRes.status).toBe(200);
    expect(activityRes.body.data.map((a) => a.type)).toContain('task.created');
  });

  it('emits task:updated with changes to the project room', async () => {
    const alice = await registerUser(app, mailer);
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'live-org2' });
    const project = await createProject(app, alice.accessToken, org.id);
    const projectId = project.body.data.id;
    const task = await createTask(app, alice.accessToken, org.id, projectId, { title: 'To update' });
    const taskId = task.body.data.id;

    const aliceSocket = connectClient(alice.accessToken);
    await waitConnect(aliceSocket);
    await ackEmit(aliceSocket, 'room:join', { room: `project:${projectId}` });

    const updatedPromise = waitEvent(aliceSocket, 'task:updated');
    const res = await request(app)
      .patch(`/api/v1/organizations/${org.id}/projects/${projectId}/tasks/${taskId}`)
      .set(auth(alice.accessToken))
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);

    const event = await updatedPromise;
    expect(event.taskId).toBe(taskId);
    expect(event.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'status', newValue: 'in_progress' })]),
    );
  });

  it('notifies and emits notification:new to the assignee when a task is assigned', async () => {
    const alice = await registerUser(app, mailer);
    const bob = await registerUser(app, mailer, { email: `bob-assignee@devforge.test` });
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'assign-org' });
    await addOrgMember(pool, { orgId: org.id, userId: bob.userId });
    const project = await createProject(app, alice.accessToken, org.id);
    await addProjectMember(pool, { projectId: project.body.data.id, userId: bob.userId });

    const bobSocket = connectClient(bob.accessToken);
    await waitConnect(bobSocket);

    const notifPromise = waitEvent(bobSocket, 'notification:new');
    const res = await createTask(app, alice.accessToken, org.id, project.body.data.id, {
      title: 'Assigned to Bob',
      assigneeId: bob.userId,
    });
    expect(res.status).toBe(201);

    const event = await notifPromise;
    expect(event.notification.type).toBe('task.assigned');
    expect(event.notification.title).toContain('Assigned to Bob');

    const unread = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(bob.accessToken));
    expect(unread.body.data.count).toBe(1);

    const list = await request(app).get('/api/v1/notifications').set(auth(bob.accessToken));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].href).toContain('/projects/');
  });

  it('emits task:comment to the task room and notifies comment targets', async () => {
    const alice = await registerUser(app, mailer);
    const bob = await registerUser(app, mailer, { email: `bob-comment@devforge.test` });
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'comment-org' });
    await addOrgMember(pool, { orgId: org.id, userId: bob.userId });
    const project = await createProject(app, alice.accessToken, org.id);
    const projectId = project.body.data.id;
    await addProjectMember(pool, { projectId, userId: bob.userId });
    const task = await createTask(app, alice.accessToken, org.id, projectId, {
      title: 'Comment target',
      assigneeId: bob.userId,
    });
    const taskId = task.body.data.id;

    const aliceSocket = connectClient(alice.accessToken);
    await waitConnect(aliceSocket);
    await ackEmit(aliceSocket, 'room:join', { room: `task:${taskId}` });

    const commentPromise = waitEvent(aliceSocket, 'task:comment');
    const commentRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/projects/${projectId}/tasks/${taskId}/comments`)
      .set(auth(alice.accessToken))
      .send({ body: 'Looking into this' });
    expect(commentRes.status).toBe(201);

    const event = await commentPromise;
    expect(event.comment.body).toBe('Looking into this');

    const unread = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(bob.accessToken));
    expect(unread.body.data.count).toBe(2);
  });
});

describe('notifications REST', () => {
  it('lists, marks read, and tracks unread counts per user', async () => {
    const alice = await registerUser(app, mailer);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, href)
       VALUES ($1, 'test', 'Hello', 'A body', '/x')`,
      [alice.userId],
    );

    const list = await request(app).get('/api/v1/notifications').set(auth(alice.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].title).toBe('Hello');

    const unread = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(alice.accessToken));
    expect(unread.body.data.count).toBe(1);

    const read = await request(app)
      .post(`/api/v1/notifications/${list.body.data[0].id}/read`)
      .set(auth(alice.accessToken));
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).not.toBeNull();

    const unreadAfter = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(alice.accessToken));
    expect(unreadAfter.body.data.count).toBe(0);

    await pool.query(
      `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'test', 'Another')`,
      [alice.userId],
    );
    const allRead = await request(app)
      .post('/api/v1/notifications/read-all')
      .set(auth(alice.accessToken));
    expect(allRead.status).toBe(200);

    const listAfter = await request(app).get('/api/v1/notifications').set(auth(alice.accessToken));
    expect(listAfter.body.data).toHaveLength(2);
    expect(listAfter.body.data.every((n) => n.readAt !== null)).toBe(true);
  });
});

describe('team chat', () => {
  it('persists and broadcasts chat messages to the chat room', async () => {
    const alice = await registerUser(app, mailer);
    const bob = await registerUser(app, mailer, { email: `bob-chat@devforge.test` });
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'chat-org' });
    await addOrgMember(pool, { orgId: org.id, userId: bob.userId });

    const bobSocket = connectClient(bob.accessToken);
    await waitConnect(bobSocket);
    await ackEmit(bobSocket, 'room:join', { room: `chat:${org.id}` });

    const messagePromise = waitEvent(bobSocket, 'chat:message');
    const send = await request(app)
      .post(`/api/v1/organizations/${org.id}/chat/messages`)
      .set(auth(alice.accessToken))
      .send({ body: 'Hello team' });
    expect(send.status).toBe(200);
    expect(send.body.data.body).toBe('Hello team');

    const event = await messagePromise;
    expect(event.message.body).toBe('Hello team');
    expect(event.message.author.name).toBe('Test User');

    const list = await request(app)
      .get(`/api/v1/organizations/${org.id}/chat/messages`)
      .set(auth(bob.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].body).toBe('Hello team');
  });

  it('broadcasts throttled typing indicators to chat room members', async () => {
    const alice = await registerUser(app, mailer);
    const bob = await registerUser(app, mailer, { email: `bob-typing@devforge.test` });
    const org = await createOrg(pool, { ownerId: alice.userId, slug: 'typing-org' });
    await addOrgMember(pool, { orgId: org.id, userId: bob.userId });

    const bobSocket = connectClient(bob.accessToken);
    await waitConnect(bobSocket);
    await ackEmit(bobSocket, 'room:join', { room: `chat:${org.id}` });

    const aliceSocket = connectClient(alice.accessToken);
    await waitConnect(aliceSocket);
    await ackEmit(aliceSocket, 'presence:join', { orgId: org.id });

    const typingPromise = waitEvent(bobSocket, 'chat:typing');
    aliceSocket.emit('chat:typing', { orgId: org.id });
    const event = await typingPromise;
    expect(event.orgId).toBe(org.id);
    expect(event.userId).toBe(alice.userId);
  });
});
