import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  AppError,
  badRequest,
  conflict,
  externalServiceError,
  notFound,
} from '../../utils/errors.js';
import { GithubApiError } from './client.js';
import { buildOrder, paginate, parsePagination } from '../../utils/list.js';

const DEFAULT_SCOPE = 'repo read:org';
const DEFAULT_WEBHOOK_EVENTS = ['push', 'pull_request'];
const STATE_TTL_MS = 10 * 60 * 1000;

const REPO_UPSERT_SQL = `
  INSERT INTO repositories (organization_id, github_repo_id, name, full_name, description,
                            owner_type, default_branch, primary_language, url, is_private,
                            stars, size_kb, pushed_at, last_synced_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
  ON CONFLICT (organization_id, github_repo_id) DO UPDATE SET
    name = EXCLUDED.name, full_name = EXCLUDED.full_name, description = EXCLUDED.description,
    owner_type = EXCLUDED.owner_type, default_branch = EXCLUDED.default_branch,
    primary_language = EXCLUDED.primary_language, url = EXCLUDED.url, is_private = EXCLUDED.is_private,
    stars = EXCLUDED.stars, size_kb = EXCLUDED.size_kb, pushed_at = EXCLUDED.pushed_at,
    last_synced_at = now(), updated_at = now()
  RETURNING *`;

const PULL_REQUEST_UPSERT_SQL = `
  INSERT INTO pull_requests (repository_id, number, title, state, author, head_ref, base_ref,
                             additions, deletions, merged_at, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  ON CONFLICT (repository_id, number) DO UPDATE SET
    title = EXCLUDED.title, state = EXCLUDED.state, author = EXCLUDED.author,
    head_ref = EXCLUDED.head_ref, base_ref = EXCLUDED.base_ref,
    additions = EXCLUDED.additions, deletions = EXCLUDED.deletions,
    merged_at = EXCLUDED.merged_at, metadata = EXCLUDED.metadata, updated_at = now()`;

function githubRepoParams(orgId, repo) {
  return [
    orgId,
    repo.id,
    repo.name,
    repo.full_name,
    repo.description ?? null,
    repo.owner?.type === 'Organization' ? 'org' : 'user',
    repo.default_branch ?? 'main',
    repo.language ?? null,
    repo.html_url ?? null,
    repo.private ?? false,
    repo.stargazers_count ?? 0,
    repo.size ?? 0,
    repo.pushed_at ? new Date(repo.pushed_at) : null,
  ];
}

function pullRequestState(pr) {
  if (pr.merged_at) return 'merged';
  return pr.state === 'closed' ? 'closed' : 'open';
}

function mapLocalRepo(r) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    githubRepoId: r.github_repo_id === null ? null : Number(r.github_repo_id),
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? null,
    ownerType: r.owner_type,
    defaultBranch: r.default_branch,
    primaryLanguage: r.primary_language ?? null,
    url: r.url,
    isPrivate: r.is_private,
    stars: r.stars,
    sizeKb: r.size_kb,
    pushedAt: r.pushed_at ?? null,
    lastSyncedAt: r.last_synced_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPullRequest(r) {
  return {
    id: r.id,
    repositoryId: r.repository_id,
    number: r.number,
    title: r.title,
    state: r.state,
    author: r.author ?? null,
    headRef: r.head_ref,
    baseRef: r.base_ref,
    additions: r.additions,
    deletions: r.deletions,
    mergedAt: r.merged_at ?? null,
    metadata: r.metadata,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapWebhook(w) {
  return {
    id: w.id,
    repositoryId: w.repository_id,
    githubWebhookId: w.github_webhook_id === null ? null : Number(w.github_webhook_id),
    events: w.events,
    active: w.active,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

function mapGithubCommit(commit) {
  return {
    sha: commit.sha,
    message: commit.commit?.message ?? null,
    author: commit.commit?.author?.name ?? commit.author?.login ?? null,
    date: commit.commit?.author?.date ?? null,
    url: commit.html_url ?? null,
  };
}

function mapGithubIssue(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    author: issue.user?.login ?? null,
    labels: (issue.labels ?? []).map((label) => ({ name: label.name, color: label.color })),
    comments: issue.comments ?? 0,
    createdAt: issue.created_at ?? null,
    updatedAt: issue.updated_at ?? null,
    url: issue.html_url ?? null,
  };
}

export function createGithubService({
  pool,
  client,
  crypto,
  oauth,
  webBaseUrl,
  apiBaseUrl,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
}) {
  const authorizeUrl = `${oauth.authorizeUrl}/authorize`;
  const tokenUrl = `${oauth.authorizeUrl}/access_token`;
  const scope = oauth.scope ?? DEFAULT_SCOPE;

  async function getConnectionRow(userId) {
    const { rows } = await pool.query(
      'SELECT * FROM github_connections WHERE user_id = $1',
      [userId],
    );
    return rows[0] ?? null;
  }

  async function requireConnectionRow(userId) {
    const row = await getConnectionRow(userId);
    if (!row) {
      throw new AppError('GitHub is not connected. Connect your GitHub account first', {
        status: 409,
        code: 'GITHUB_NOT_CONNECTED',
      });
    }
    return row;
  }

  async function markExpired(row) {
    await pool.query(
      'UPDATE github_connections SET token_expires_at = now(), updated_at = now() WHERE id = $1',
      [row.id],
    );
  }

  const tokenExpiredError = () =>
    new AppError('GitHub access token is invalid or expired — reconnect your account', {
      status: 409,
      code: 'GITHUB_TOKEN_EXPIRED',
    });

  async function getAccessToken(userId) {
    const row = await requireConnectionRow(userId);
    let token;
    try {
      token = crypto.decrypt(row.access_token_encrypted);
    } catch {
      await markExpired(row);
      throw tokenExpiredError();
    }
    if (row.token_expires_at && new Date(row.token_expires_at) <= now()) {
      throw tokenExpiredError();
    }
    return { token, row };
  }

  async function withToken(userId, fn) {
    const { token, row } = await getAccessToken(userId);
    try {
      return await fn(token);
    } catch (err) {
      if (err instanceof GithubApiError && err.status === 401) {
        await markExpired(row);
        throw tokenExpiredError();
      }
      throw err;
    }
  }

  async function beginOAuth({ userId }) {
    const state = crypto.sign({
      userId,
      exp: now().getTime() + STATE_TTL_MS,
      nonce: randomBytes(8).toString('hex'),
    });
    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.callbackUrl,
      scope,
      state,
    });
    return { data: { url: `${authorizeUrl}?${params.toString()}` } };
  }

  async function exchangeCode(code) {
    let response;
    try {
      response = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          code,
          redirect_uri: oauth.callbackUrl,
        }).toString(),
      });
    } catch (err) {
      throw externalServiceError('GitHub OAuth token exchange failed', null, err);
    }
    if (!response.ok) {
      throw externalServiceError(`GitHub OAuth token exchange failed with status ${response.status}`);
    }
    return response.json();
  }

  async function completeOAuth({ code, state }) {
    const payload = crypto.verify(state);
    if (!payload || !payload.userId || payload.exp < now().getTime()) {
      throw badRequest('Invalid or expired OAuth state');
    }
    const tokenResponse = await exchangeCode(code);
    if (tokenResponse.error) {
      throw badRequest(
        `GitHub authorization failed: ${tokenResponse.error_description ?? tokenResponse.error}`,
      );
    }
    if (!tokenResponse.access_token) {
      throw badRequest('GitHub authorization returned no access token');
    }
    const user = await client.getAuthenticatedUser({ token: tokenResponse.access_token });
    const expiresAt = tokenResponse.expires_in
      ? new Date(now().getTime() + Number(tokenResponse.expires_in) * 1000)
      : null;
    const scopes = (tokenResponse.scope ?? '').split(/\s+/).filter(Boolean);
    try {
      await pool.query(
        `INSERT INTO github_connections (user_id, github_user_id, github_login, access_token_encrypted,
                                         refresh_token_encrypted, token_expires_at, scopes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           github_user_id = EXCLUDED.github_user_id, github_login = EXCLUDED.github_login,
           access_token_encrypted = EXCLUDED.access_token_encrypted,
           refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
           token_expires_at = EXCLUDED.token_expires_at, scopes = EXCLUDED.scopes,
           updated_at = now()`,
        [
          payload.userId,
          user.id,
          user.login,
          crypto.encrypt(tokenResponse.access_token),
          tokenResponse.refresh_token ? crypto.encrypt(tokenResponse.refresh_token) : null,
          expiresAt,
          scopes,
        ],
      );
    } catch (err) {
      if (err.code === '23505') {
        throw conflict('This GitHub account is already connected to another DevForge user');
      }
      throw err;
    }
    return { login: user.login, githubUserId: user.id };
  }

  function buildOAuthRedirect({ ok = true, message = '' } = {}) {
    const params = new URLSearchParams();
    params.set('github', ok ? 'connected' : 'error');
    if (message) {
      params.set('message', message);
    }
    return `${webBaseUrl}/repositories?${params.toString()}`;
  }

  async function getConnection({ userId }) {
    const row = await getConnectionRow(userId);
    if (!row) {
      return { data: { connected: false } };
    }
    return {
      data: {
        connected: true,
        githubUserId: row.github_user_id === null ? null : Number(row.github_user_id),
        login: row.github_login,
        scopes: row.scopes,
        tokenExpiresAt: row.token_expires_at ?? null,
        connectedAt: row.created_at,
      },
    };
  }

  async function disconnect({ userId }) {
    await pool.query('DELETE FROM github_connections WHERE user_id = $1', [userId]);
    return { ok: true };
  }

  async function getOrgRow(orgId) {
    const { rows } = await pool.query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    return rows[0] ?? null;
  }

  async function assertOrg(orgId) {
    if (!(await getOrgRow(orgId))) {
      throw notFound('Organization not found');
    }
  }

  async function getRepoRow({ orgId, repoId }) {
    const { rows } = await pool.query(
      'SELECT * FROM repositories WHERE organization_id = $1 AND id = $2',
      [orgId, repoId],
    );
    return rows[0] ?? null;
  }

  async function assertRepo({ orgId, repoId }) {
    const repo = await getRepoRow({ orgId, repoId });
    if (!repo) {
      throw notFound('Repository not found');
    }
    return repo;
  }

  async function syncPullRequests(dbClient, repoRow, token) {
    const pulls = await client.listPullRequests({
      token,
      fullName: repoRow.full_name,
      state: 'all',
    });
    for (const pr of pulls) {
      await dbClient.query(PULL_REQUEST_UPSERT_SQL, [
        repoRow.id,
        pr.number,
        pr.title,
        pullRequestState(pr),
        pr.user?.login ?? null,
        pr.head?.ref ?? '',
        pr.base?.ref ?? '',
        pr.additions ?? 0,
        pr.deletions ?? 0,
        pr.merged_at ? new Date(pr.merged_at) : null,
        JSON.stringify({
          url: pr.html_url ?? null,
          body: pr.body ?? null,
          createdAt: pr.created_at ?? null,
          updatedAt: pr.updated_at ?? null,
        }),
      ]);
    }
  }

  async function writeRepoAndPullRequests({ orgId, remote, token }) {
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      const { rows } = await dbClient.query(REPO_UPSERT_SQL, githubRepoParams(orgId, remote));
      await syncPullRequests(dbClient, rows[0], token);
      await dbClient.query('COMMIT');
      return rows[0];
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }
  }

  async function importRepository({ orgId, userId, fullName }) {
    await assertOrg(orgId);
    return withToken(userId, async (token) => {
      let remote;
      try {
        remote = await client.getRepository({ token, fullName });
      } catch (err) {
        if (err instanceof GithubApiError && err.status === 404) {
          throw notFound('Repository not found or your account cannot access it');
        }
        throw err;
      }
      const repo = await writeRepoAndPullRequests({ orgId, remote, token });
      return { data: mapLocalRepo(repo) };
    });
  }

  async function syncRepository({ orgId, repoId, userId }) {
    const repo = await assertRepo({ orgId, repoId });
    return withToken(userId, async (token) => {
      const remote = await client.getRepository({ token, fullName: repo.full_name });
      const updated = await writeRepoAndPullRequests({ orgId, remote, token });
      return { data: mapLocalRepo(updated) };
    });
  }

  async function listRepositories({ orgId }) {
    await assertOrg(orgId);
    const { rows } = await pool.query(
      'SELECT * FROM repositories WHERE organization_id = $1 ORDER BY name ASC',
      [orgId],
    );
    return { data: rows.map(mapLocalRepo) };
  }

  async function getRepository({ orgId, repoId }) {
    const repo = await assertRepo({ orgId, repoId });
    return { data: mapLocalRepo(repo) };
  }

  async function removeRepository({ orgId, repoId }) {
    await assertRepo({ orgId, repoId });
    await pool.query('DELETE FROM repositories WHERE id = $1', [repoId]);
    return { ok: true };
  }

  async function downloadRepositoryArchive({ orgId, repoId, ref }) {
    const repo = await assertRepo({ orgId, repoId });
    const { rows } = await pool.query('SELECT owner_id FROM organizations WHERE id = $1', [orgId]);
    if (rows.length === 0) {
      throw notFound('Organization not found');
    }
    const response = await withToken(rows[0].owner_id, (token) =>
      client.downloadTarball({
        token,
        fullName: repo.full_name,
        ref: ref ?? repo.default_branch,
      }),
    );
    return { repo, response };
  }

  async function downloadPullRequestDiff({ orgId, repoId, prNumber }) {
    const repo = await assertRepo({ orgId, repoId });
    const { rows } = await pool.query('SELECT owner_id FROM organizations WHERE id = $1', [orgId]);
    if (rows.length === 0) {
      throw notFound('Organization not found');
    }
    let response;
    try {
      response = await withToken(rows[0].owner_id, (token) =>
        client.getPullRequestDiff({
          token,
          fullName: repo.full_name,
          number: prNumber,
        }),
      );
    } catch (err) {
      if (err instanceof GithubApiError && err.status === 404) {
        throw notFound(`Pull request #${prNumber} not found`);
      }
      if (err instanceof GithubApiError) {
        throw externalServiceError(`Failed to fetch pull request #${prNumber} diff`, null, err);
      }
      throw err;
    }
    const diff = await response.text().catch(() => null);
    return { repo, diff };
  }

  async function commitGeneratedFile({ orgId, repoId, path, content, message }) {
    const repo = await assertRepo({ orgId, repoId });
    const { rows } = await pool.query('SELECT owner_id FROM organizations WHERE id = $1', [orgId]);
    if (rows.length === 0) {
      throw notFound('Organization not found');
    }
    return withToken(rows[0].owner_id, async (token) => {
      let existingSha = null;
      try {
        const existing = await client.getFile({ token, fullName: repo.full_name, path });
        existingSha = existing?.sha ?? null;
      } catch (err) {
        if (err instanceof GithubApiError && err.status === 404) {
          existingSha = null;
        } else {
          throw externalServiceError(`Failed to inspect ${path} on GitHub`, null, err);
        }
      }
      try {
        const created = await client.createOrUpdateFile({
          token,
          fullName: repo.full_name,
          path,
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          sha: existingSha,
        });
        return { path, sha: created?.content?.sha ?? null, committed: true };
      } catch (err) {
        if (err instanceof GithubApiError && err.status === 422) {
          throw conflict(`Could not commit ${path} — it may have changed on GitHub`);
        }
        throw externalServiceError(`Failed to commit ${path}`, null, err);
      }
    });
  }

  async function listPullRequests({ orgId, repoId, query }) {
    await assertRepo({ orgId, repoId });
    const { page, pageSize } = parsePagination(query);
    const conditions = ['repository_id = $1'];
    const params = [repoId];
    if (query.state !== undefined && query.state !== '') {
      params.push(query.state);
      conditions.push(`state = $${params.length}`);
    }
    const result = await paginate(pool, {
      baseFrom: 'pull_requests',
      where: conditions.join(' AND '),
      params,
      orderBy: buildOrder(
        query.sort,
        ['number', 'title', 'state', 'author', 'created_at', 'updated_at'],
        'created_at DESC',
      ),
      select: 'SELECT *',
      page,
      pageSize,
    });
    return { data: result.data.map(mapPullRequest), meta: result.meta };
  }

  async function listBranches({ orgId, repoId, userId }) {
    const repo = await assertRepo({ orgId, repoId });
    return withToken(userId, async (token) => {
      const branches = await client.listBranches({ token, fullName: repo.full_name });
      return {
        data: branches.map((branch) => ({
          name: branch.name,
          sha: branch.commit?.sha ?? null,
          protected: Boolean(branch.protected),
        })),
      };
    });
  }

  async function listCommits({ orgId, repoId, userId, branch }) {
    const repo = await assertRepo({ orgId, repoId });
    return withToken(userId, async (token) => {
      const commits = await client.listCommits({
        token,
        fullName: repo.full_name,
        sha: branch ?? repo.default_branch,
      });
      return { data: commits.map(mapGithubCommit) };
    });
  }

  async function listIssues({ orgId, repoId, userId, query }) {
    const repo = await assertRepo({ orgId, repoId });
    return withToken(userId, async (token) => {
      const issues = await client.listIssues({
        token,
        fullName: repo.full_name,
        state: query.state ?? 'open',
      });
      return { data: issues.filter((issue) => !issue.pull_request).map(mapGithubIssue) };
    });
  }

  async function listWebhooks({ orgId, repoId }) {
    await assertRepo({ orgId, repoId });
    const { rows } = await pool.query(
      'SELECT * FROM repository_webhooks WHERE repository_id = $1 ORDER BY created_at ASC',
      [repoId],
    );
    return { data: rows.map(mapWebhook) };
  }

  async function createWebhook({ orgId, repoId, userId, events }) {
    const repo = await assertRepo({ orgId, repoId });
    const eventList = events && events.length > 0 ? events : DEFAULT_WEBHOOK_EVENTS;
    const secret = randomBytes(32).toString('hex');
    const url = `${apiBaseUrl}/api/v1/webhooks/github/${repo.id}`;
    const created = await withToken(userId, (token) =>
      client.createWebhook({ token, fullName: repo.full_name, url, secret, events: eventList }),
    );
    const { rows } = await pool.query(
      `INSERT INTO repository_webhooks (repository_id, github_webhook_id, secret_encrypted, events, active)
       VALUES ($1, $2, $3, $4, true) RETURNING *`,
      [repo.id, created?.id ?? null, crypto.encrypt(secret), eventList],
    );
    return { data: mapWebhook(rows[0]) };
  }

  async function deleteWebhook({ orgId, repoId, webhookId, userId }) {
    const repo = await assertRepo({ orgId, repoId });
    const { rows } = await pool.query(
      'SELECT * FROM repository_webhooks WHERE id = $1 AND repository_id = $2',
      [webhookId, repoId],
    );
    if (rows.length === 0) {
      throw notFound('Webhook not found');
    }
    const webhook = rows[0];
    if (webhook.github_webhook_id) {
      const githubWebhookId = Number(webhook.github_webhook_id);
      await withToken(userId, (token) =>
        client
          .deleteWebhook({ token, fullName: repo.full_name, webhookId: githubWebhookId })
          .catch((err) => {
            if (err instanceof GithubApiError && err.status === 404) {
              return null;
            }
            throw err;
          }),
      );
    }
    await pool.query('DELETE FROM repository_webhooks WHERE id = $1', [webhookId]);
    return { ok: true };
  }

  function verifyWebhookSignature(row, signature, rawBody) {
    if (!signature || !rawBody) {
      return false;
    }
    const prefix = 'sha256=';
    if (!signature.startsWith(prefix)) {
      return false;
    }
    let secret;
    try {
      secret = crypto.decrypt(row.secret_encrypted);
    } catch {
      return false;
    }
    const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
    const received = Buffer.from(signature.slice(prefix.length), 'hex');
    const wanted = Buffer.from(digest, 'hex');
    return received.length === wanted.length && timingSafeEqual(received, wanted);
  }

  async function syncRepositoryFromWebhook(repoId) {
    const { rows } = await pool.query(
      `SELECT r.*, o.owner_id
         FROM repositories r
         JOIN organizations o ON o.id = r.organization_id
        WHERE r.id = $1`,
      [repoId],
    );
    if (rows.length === 0) {
      return;
    }
    const repo = rows[0];
    const { rows: connRows } = await pool.query(
      'SELECT * FROM github_connections WHERE user_id = $1',
      [repo.owner_id],
    );
    if (connRows.length === 0) {
      return;
    }
    let token;
    try {
      token = crypto.decrypt(connRows[0].access_token_encrypted);
    } catch {
      return;
    }
    try {
      const remote = await client.getRepository({ token, fullName: repo.full_name });
      await writeRepoAndPullRequests({ orgId: repo.organization_id, remote, token });
    } catch {
      // Webhook acknowledgement must not fail because a background sync did.
    }
  }

  async function handleWebhook({ repoId, event, signature, rawBody }) {
    const { rows } = await pool.query(
      'SELECT * FROM repository_webhooks WHERE repository_id = $1 AND active = true',
      [repoId],
    );
    if (rows.length === 0) {
      throw notFound('No active webhook registered for this repository');
    }
    const matched = rows.find((row) => verifyWebhookSignature(row, signature, rawBody));
    if (!matched) {
      throw new AppError('Webhook signature verification failed', {
        status: 401,
        code: 'INVALID_WEBHOOK_SIGNATURE',
      });
    }
    let body;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw badRequest('Webhook payload is not valid JSON');
    }
    if (event === 'ping') {
      return { data: { ok: true, event, repository: body.repository?.full_name ?? null } };
    }
    if (event === 'push' || event === 'pull_request') {
      await syncRepositoryFromWebhook(repoId);
      return { data: { ok: true, event, synced: true } };
    }
    return { data: { ok: true, event } };
  }

  return {
    beginOAuth,
    completeOAuth,
    buildOAuthRedirect,
    getConnection,
    disconnect,
    importRepository,
    syncRepository,
    listRepositories,
    getRepository,
    removeRepository,
    downloadRepositoryArchive,
    downloadPullRequestDiff,
    commitGeneratedFile,
    listPullRequests,
    listBranches,
    listCommits,
    listIssues,
    listWebhooks,
    createWebhook,
    deleteWebhook,
    handleWebhook,
  };
}
