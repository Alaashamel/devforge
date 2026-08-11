import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiError, API_URL } from '../services/api.js';

describe('api client', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
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
});
