import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ROLES, hasPermission, maxRole } from '../src/modules/auth/permissions.js';
import { createAuthMiddleware } from '../src/modules/auth/middleware.js';
import { createAccessTokenService } from '../src/modules/auth/tokens.js';
import { errorHandler } from '../src/middleware/error-handler.js';

describe('permission matrix', () => {
  const expectations = [
    ['org.manage', { owner: true, admin: true, maintainer: false, developer: false, viewer: false }],
    ['members.manage', { owner: true, admin: true, maintainer: false, developer: false, viewer: false }],
    ['projects.create', { owner: true, admin: true, maintainer: true, developer: false, viewer: false }],
    ['projects.manage', { owner: true, admin: true, maintainer: true, developer: false, viewer: false }],
    ['projects.delete', { owner: true, admin: true, maintainer: true, developer: false, viewer: false }],
    ['tasks.manage', { owner: true, admin: true, maintainer: true, developer: true, viewer: false }],
    ['project.view', { owner: true, admin: true, maintainer: true, developer: true, viewer: true }],
    ['ai.run', { owner: true, admin: true, maintainer: true, developer: true, viewer: false }],
    ['repos.manage', { owner: true, admin: true, maintainer: true, developer: false, viewer: false }],
  ];

  for (const [permission, expected] of expectations) {
    it(`enforces '${permission}' per the matrix`, () => {
      for (const role of ROLES) {
        expect(hasPermission(role, permission), `${role} for ${permission}`).toBe(expected[role]);
      }
    });
  }

  it('throws for unknown permissions', () => {
    expect(() => hasPermission('owner', 'nope')).toThrow('unknown permission: nope');
  });

  it('maxRole returns the more permissive role', () => {
    expect(maxRole('developer', 'maintainer')).toBe('maintainer');
    expect(maxRole('owner', 'admin')).toBe('owner');
    expect(maxRole('viewer', null)).toBe('viewer');
    expect(maxRole(null, null)).toBeNull();
  });
});

describe('auth middleware enforcement', () => {
  const accessTokens = createAccessTokenService({ secret: 'z'.repeat(40) });
  const roleMap = new Map([
    ['viewer-user', 'viewer'],
    ['developer-user', 'developer'],
    ['maintainer-user', 'maintainer'],
  ]);
  const auth = createAuthMiddleware({
    accessTokens,
    resolveRole: async ({ userId }) => roleMap.get(userId) ?? null,
  });

  function buildApp(permission) {
    const app = express();
    app.get(
      '/resource/:projectId',
      auth.requireAuth,
      auth.authorize(permission),
      (_req, res) => res.json({ ok: true }),
    );
    app.use(errorHandler());
    return app;
  }

  it('rejects a missing bearer token with 401', async () => {
    const res = await request(buildApp('tasks.manage')).get('/resource/p1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed token with 401', async () => {
    const res = await request(buildApp('tasks.manage'))
      .get('/resource/p1')
      .set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });

  it('forbids a viewer from managing tasks with 403', async () => {
    const token = await accessTokens.sign({ id: 'viewer-user', email: 'viewer@x.io' });
    const res = await request(buildApp('tasks.manage'))
      .get('/resource/p1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows a developer to manage tasks', async () => {
    const token = await accessTokens.sign({ id: 'developer-user', email: 'dev@x.io' });
    const res = await request(buildApp('tasks.manage'))
      .get('/resource/p1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('forbids a developer from managing repositories', async () => {
    const token = await accessTokens.sign({ id: 'developer-user', email: 'dev@x.io' });
    const res = await request(buildApp('repos.manage'))
      .get('/resource/p1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows a maintainer to manage repositories', async () => {
    const token = await accessTokens.sign({ id: 'maintainer-user', email: 'mnt@x.io' });
    const res = await request(buildApp('repos.manage'))
      .get('/resource/p1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
