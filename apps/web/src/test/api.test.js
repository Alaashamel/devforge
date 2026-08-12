import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiError, API_URL, setAccessToken, setRefreshHandler } from '../services/api.js';

describe('api client', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setAccessToken(null);
    setRefreshHandler(null);
    vi.restoreAllMocks();
  });

  it('defaults to the local API URL in development', () => {
    expect(API_URL).toBe('http://localhost:4000/api/v1');
  });

  it('unwraps the data envelope on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'ok', service: 'devforge-api' } }),
    });

    await expect(api.getHealth()).resolves.toEqual({
      status: 'ok',
      service: 'devforge-api',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/health',
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it('throws an ApiError carrying envelope details on failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: { code: 'internal_error', message: 'boom', requestId: 'abc123' },
      }),
    });

    const promise = api.getHealth();
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      message: 'boom',
      status: 500,
      code: 'internal_error',
      requestId: 'abc123',
    });
  });

  it('treats a 503 readiness response as data (degraded)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ data: { status: 'degraded', checks: { database: 'down' } } }),
    });

    await expect(api.getReady()).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'down' },
    });
  });

  it('falls back to a generic message when the payload is not JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('not json');
      },
    });

    await expect(api.getHealth()).rejects.toMatchObject({
      message: 'Request failed with status 502',
      status: 502,
    });
  });

  it('sends the Authorization header when a token is set', async () => {
    setAccessToken('access-123');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    });

    await api.me();
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/v1/auth/me');
    expect(options.headers.Authorization).toBe('Bearer access-123');
  });

  it('refreshes the access token once on a 401 and retries the request', async () => {
    setAccessToken('old-token');
    const refreshHandler = vi.fn().mockResolvedValue(true);
    setRefreshHandler(refreshHandler);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { status: 'ok' } }),
      });

    await expect(api.getHealth()).resolves.toEqual({ status: 'ok' });
    expect(refreshHandler).toHaveBeenCalledTimes(1);
  });

  it('does not loop when the retried request still fails', async () => {
    setRefreshHandler(vi.fn().mockResolvedValue(true));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'nope' } }),
    });

    await expect(api.me()).rejects.toMatchObject({ message: 'nope' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not attempt a refresh for auth endpoints like login', async () => {
    const refreshHandler = vi.fn();
    setRefreshHandler(refreshHandler);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }),
    });

    await expect(api.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
    expect(refreshHandler).not.toHaveBeenCalled();
  });

  it('builds org-scoped nested URLs for projects', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { projects: [], meta: {} } }),
    });

    await api.listProjects('org-1', { pageSize: 100 });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/v1/organizations/org-1/projects?pageSize=100');
  });

  it('serializes query params and skips empty values', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { tasks: [], meta: {} } }),
    });

    await api.listTasks('org-1', 'proj-1', { status: 'todo', q: 'login', sort: '-priority', pageSize: 50, label: undefined });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(
      'http://localhost:4000/api/v1/organizations/org-1/projects/proj-1/tasks?status=todo&q=login&sort=-priority&pageSize=50',
    );
  });

  it('POSTs a createTask body to the nested path', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 't-1', title: 'Ship it' } }),
    });

    await api.createTask('org-1', 'proj-1', { title: 'Ship it', priority: 'high' });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/v1/organizations/org-1/projects/proj-1/tasks');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ title: 'Ship it', priority: 'high' });
  });

  it('sends label replacement via PUT to the task labels path', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { labelIds: ['l-1'] } }),
    });

    await api.setTaskLabels('org-1', 'proj-1', 't-1', { labelIds: ['l-1'] });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/v1/organizations/org-1/projects/proj-1/tasks/t-1/labels');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ labelIds: ['l-1'] });
  });

  it('accepts a 204 response for DELETE endpoints', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    });

    await expect(api.deleteProject('org-1', 'proj-1')).resolves.toBeUndefined();
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/v1/organizations/org-1/projects/proj-1');
    expect(options.method).toBe('DELETE');
  });

  it('lists task dependencies from the nested path', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { dependsOn: [], dependedOnBy: [] } }),
    });

    await expect(api.listDependencies('org-1', 'proj-1', 't-1')).resolves.toEqual({
      dependsOn: [],
      dependedOnBy: [],
    });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(
      'http://localhost:4000/api/v1/organizations/org-1/projects/proj-1/tasks/t-1/dependencies',
    );
  });
});
