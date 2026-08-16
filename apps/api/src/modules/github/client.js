export class GithubApiError extends Error {
  constructor(status, message, { headers = null, body = null, requestPath = '' } = {}) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
    this.headers = headers;
    this.body = body;
    this.requestPath = requestPath;
  }
}

const DEFAULT_MAX_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

function buildUrl(path, params) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  if (!query) {
    return path;
  }
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}

function backoffMs(attempt) {
  return Math.min(200 * 2 ** (attempt - 1), 4000);
}

function rateLimitDelay(response, now = Date.now) {
  const status = response.status;
  const remaining = response.headers?.get?.('x-ratelimit-remaining');
  if ((status === 403 || status === 429) && remaining === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(reset)) {
      const wait = reset * 1000 - now() + 500;
      if (wait > 0) {
        return Math.min(wait, MAX_RATE_LIMIT_WAIT_MS);
      }
    }
  }
  const retryAfter = response.headers?.get?.('retry-after');
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1000, 0) + 250, MAX_RATE_LIMIT_WAIT_MS);
    }
  }
  return null;
}

function isRateLimited(response, now = Date.now) {
  return rateLimitDelay(response, now) !== null;
}

async function parseBody(response) {
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export function createGithubClient({
  fetchImpl = globalThis.fetch,
  apiUrl = 'https://api.github.com',
  userAgent = 'devforge',
  maxRetries = DEFAULT_MAX_RETRIES,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createGithubClient requires a fetch implementation');
  }

  async function request(method, path, { token, body, raw = false, accept = 'application/vnd.github+json' } = {}) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const headers = {
        Accept: accept,
        'User-Agent': userAgent,
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const response = await fetchImpl(`${apiUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401) {
        throw new GithubApiError(401, 'GitHub authentication failed — token may be invalid or expired', {
          headers: response.headers,
          requestPath: path,
        });
      }
      if (attempt < maxRetries && isRateLimited(response)) {
        await sleep(rateLimitDelay(response));
        continue;
      }
      if (attempt < maxRetries && response.status >= 500) {
        await sleep(backoffMs(attempt));
        continue;
      }
      if (!response.ok) {
        const rawBody = await response.text().catch(() => null);
        throw new GithubApiError(response.status, `GitHub API request failed with status ${response.status}`, {
          headers: response.headers,
          body: rawBody,
          requestPath: path,
        });
      }
      if (raw) {
        return response;
      }
      return parseBody(response);
    }
  }

  const encodeName = (fullName) =>
    String(fullName)
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

  const encodePath = (path) =>
    String(path)
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

  return {
    getAuthenticatedUser: ({ token }) => request('GET', '/user', { token }),
    listRepositories: ({ token }) =>
      request(
        'GET',
        buildUrl('/user/repos', {
          per_page: 100,
          affiliation: 'owner,collaborator,organization_member',
          sort: 'updated',
        }),
        { token },
      ),
    getRepository: ({ token, fullName }) => request('GET', `/repos/${encodeName(fullName)}`, { token }),
    listBranches: ({ token, fullName }) =>
      request('GET', buildUrl(`/repos/${encodeName(fullName)}/branches`, { per_page: 100 }), { token }),
    listCommits: ({ token, fullName, sha }) =>
      request(
        'GET',
        buildUrl(`/repos/${encodeName(fullName)}/commits`, { per_page: 100, sha }),
        { token },
      ),
    listPullRequests: ({ token, fullName, state = 'all' }) =>
      request(
        'GET',
        buildUrl(`/repos/${encodeName(fullName)}/pulls`, { per_page: 100, state }),
        { token },
      ),
    getPullRequestDiff: ({ token, fullName, number }) =>
      request(
        'GET',
        `/repos/${encodeName(fullName)}/pulls/${encodeURIComponent(number)}`,
        { token, raw: true, accept: 'application/vnd.github.diff' },
      ),
    getFile: ({ token, fullName, path }) =>
      request('GET', `/repos/${encodeName(fullName)}/contents/${encodePath(path)}`, { token }),
    createOrUpdateFile: ({ token, fullName, path, message, content, sha }) =>
      request(
        'PUT',
        `/repos/${encodeName(fullName)}/contents/${encodePath(path)}`,
        { token, body: { message, content, ...(sha ? { sha } : {}) } },
      ),
    listIssues: ({ token, fullName, state = 'open' }) =>
      request('GET', buildUrl(`/repos/${encodeName(fullName)}/issues`, { per_page: 100, state }), { token }),
    createWebhook: ({ token, fullName, url, secret, events }) =>
      request(
        'POST',
        `/repos/${encodeName(fullName)}/hooks`,
        {
          token,
          body: {
            name: 'web',
            active: true,
            events,
            config: { url, content_type: 'json', insecure_ssl: '0', secret },
          },
        },
      ),
    deleteWebhook: ({ token, fullName, webhookId }) =>
      request('DELETE', `/repos/${encodeName(fullName)}/hooks/${webhookId}`, { token }),
    downloadTarball: ({ token, fullName, ref }) =>
      request(
        'GET',
        `/repos/${encodeName(fullName)}/tarball${ref ? `/${encodeURIComponent(ref)}` : ''}`,
        { token, raw: true },
      ),
  };
}
