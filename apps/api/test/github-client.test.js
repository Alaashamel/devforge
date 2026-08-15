import { describe, it, expect, vi } from 'vitest';
import { createGithubClient, GithubApiError } from '../src/modules/github/client.js';

const apiUrl = 'https://api.github.com';

function mockResponse({ status, headers = {}, body = null }) {
  if (body !== null && typeof body !== 'string' && !headers['content-type']) {
    headers = { ...headers, 'content-type': 'application/json' };
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  };
}

describe('github client', () => {
  it('returns parsed JSON on success and sends auth headers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, body: { login: 'octocat' } }));
    const client = createGithubClient({ fetchImpl, apiUrl, userAgent: 'devforge-test', maxRetries: 3 });
    await expect(client.getAuthenticatedUser({ token: 't' })).resolves.toEqual({ login: 'octocat' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/user');
    expect(options.headers.Authorization).toBe('Bearer t');
    expect(options.headers['User-Agent']).toBe('devforge-test');
  });

  it('retries 5xx responses with exponential backoff then succeeds', async () => {
    const sleep = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 502, body: {} }))
      .mockResolvedValueOnce(mockResponse({ status: 503, body: {} }))
      .mockResolvedValueOnce(mockResponse({ status: 200, body: [{ name: 'main' }] }));
    const client = createGithubClient({ fetchImpl, apiUrl, maxRetries: 3, sleep });
    await expect(client.listBranches({ token: 't', fullName: 'a/b' })).resolves.toEqual([
      { name: 'main' },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 200);
    expect(sleep).toHaveBeenNthCalledWith(2, 400);
  });

  it('throws after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 500, body: {} }));
    const client = createGithubClient({ fetchImpl, apiUrl, maxRetries: 3, sleep: vi.fn() });
    const err = await client.getRepository({ token: 't', fullName: 'a/b' }).catch((e) => e);
    expect(err).toBeInstanceOf(GithubApiError);
    expect(err.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('waits for the rate-limit reset when remaining is zero', async () => {
    const future = Math.floor(Date.now() / 1000) + 60;
    const sleep = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(future) },
          body: {},
        }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 200, body: [] }));
    const client = createGithubClient({ fetchImpl, apiUrl, maxRetries: 3, sleep });
    await client.listRepositories({ token: 't' });
    const wait = sleep.mock.calls[0][0];
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60_000);
  });

  it('honours Retry-After when present', async () => {
    const sleep = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({ status: 429, headers: { 'retry-after': '5' }, body: {} }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 200, body: [] }));
    const client = createGithubClient({ fetchImpl, apiUrl, maxRetries: 3, sleep });
    await client.listIssues({ token: 't', fullName: 'a/b', state: 'open' });
    expect(sleep).toHaveBeenCalledWith(5250);
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 404, body: {} }));
    const client = createGithubClient({ fetchImpl, apiUrl, maxRetries: 3, sleep: vi.fn() });
    const err = await client.getRepository({ token: 't', fullName: 'a/b' }).catch((e) => e);
    expect(err).toBeInstanceOf(GithubApiError);
    expect(err.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 401 without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 401, body: {} }));
    const client = createGithubClient({ fetchImpl, apiUrl, maxRetries: 3, sleep: vi.fn() });
    await expect(client.getAuthenticatedUser({ token: 't' })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns null for 204 responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 204, body: null }));
    const client = createGithubClient({ fetchImpl, apiUrl });
    await expect(
      client.deleteWebhook({ token: 't', fullName: 'a/b', webhookId: 5 }),
    ).resolves.toBeNull();
  });

  it('builds per-repository paths with encoded names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 200, body: {} }));
    const client = createGithubClient({ fetchImpl, apiUrl });
    await client.getRepository({ token: 't', fullName: 'acme/dev forge' });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/dev%20forge');
  });

  it('downloads a repository tarball as a raw response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 200, body: 'tar' }));
    const client = createGithubClient({ fetchImpl, apiUrl });
    const response = await client.downloadTarball({ token: 't', fullName: 'a/b', ref: 'main' });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/a/b/tarball/main');
    expect(response.status).toBe(200);
  });

  it('fetches a pull request diff with the diff accept header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 200, body: 'diff --git a/x b/x\n' }));
    const client = createGithubClient({ fetchImpl, apiUrl });
    const response = await client.getPullRequestDiff({ token: 't', fullName: 'a/b', number: 7 });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/a/b/pulls/7');
    expect(options.headers.Accept).toBe('application/vnd.github.diff');
    expect(await response.text()).toContain('diff --git');
  });

  it('defaults the tarball ref to the repository default branch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 200, body: 'tar' }));
    const client = createGithubClient({ fetchImpl, apiUrl });
    await client.downloadTarball({ token: 't', fullName: 'a/b' });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/a/b/tarball');
  });

  it('encodes tarball refs containing slashes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 200, body: 'tar' }));
    const client = createGithubClient({ fetchImpl, apiUrl });
    await client.downloadTarball({ token: 't', fullName: 'a/b', ref: 'feature/x' });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/a/b/tarball/feature%2Fx');
  });
});
