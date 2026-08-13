import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { ErrorBanner, Field, buttonClass, ghostButtonClass, inputClass } from '../components/form.jsx';

const stateTone = {
  open: 'text-green-400',
  closed: 'text-muted',
  merged: 'text-purple-400',
};

export function RepositoryDetail() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgId = useWorkspaceStore((s) => s.orgId);

  const repoQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories', repoId],
    queryFn: () => api.getRepository(orgId, repoId),
    enabled: Boolean(orgId),
  });
  const connectionQuery = useQuery({
    queryKey: ['github', 'connection'],
    queryFn: api.getGithubConnection,
  });

  const [tab, setTab] = useState('overview');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [branch, setBranch] = useState('');

  const [webhookEvents, setWebhookEvents] = useState(['push', 'pull_request']);

  const syncMutation = useMutation({
    mutationFn: () => api.syncRepository(orgId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'repositories', repoId] });
      setNotice('Repository synced.');
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.deleteRepository(orgId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'repositories'] });
      navigate('/repositories');
    },
    onError: (err) => setError(err.message),
  });

  const webhookMutation = useMutation({
    mutationFn: (payload) => api.createWebhook(orgId, repoId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'repositories', repoId, 'webhooks'] });
      setWebhookEvents(['push', 'pull_request']);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (webhookId) => api.deleteWebhook(orgId, repoId, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'repositories', repoId, 'webhooks'] });
    },
    onError: (err) => setError(err.message),
  });

  const prsQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories', repoId, 'pull-requests'],
    queryFn: () => api.listPullRequests(orgId, repoId, { pageSize: 100 }),
    enabled: Boolean(orgId) && tab === 'pull-requests',
  });
  const branchesQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories', repoId, 'branches'],
    queryFn: () => api.listBranches(orgId, repoId),
    enabled: Boolean(orgId) && (tab === 'branches' || tab === 'commits'),
  });
  const commitsQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories', repoId, 'commits', branch],
    queryFn: () => api.listCommits(orgId, repoId, { branch: branch || undefined }),
    enabled: Boolean(orgId) && tab === 'commits',
  });
  const issuesQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories', repoId, 'issues'],
    queryFn: () => api.listIssues(orgId, repoId, { state: 'open' }),
    enabled: Boolean(orgId) && tab === 'issues',
  });
  const webhooksQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories', repoId, 'webhooks'],
    queryFn: () => api.listWebhooks(orgId, repoId),
    enabled: Boolean(orgId) && tab === 'webhooks',
  });

  const connected = connectionQuery.data?.connected === true;

  if (repoQuery.isPending) {
    return <p className="text-sm text-muted">Loading repository…</p>;
  }
  if (repoQuery.isError) {
    return <ErrorBanner>{repoQuery.error.message}</ErrorBanner>;
  }

  const repo = repoQuery.data;
  const resolvedBranch = branch || repo.defaultBranch;

  function toggleEvent(event) {
    setWebhookEvents((events) =>
      events.includes(event) ? events.filter((e) => e !== event) : [...events, event],
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/repositories" className="text-xs text-muted hover:text-ink">
          ← Repositories
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{repo.fullName}</h1>
          <span className={`rounded border border-line px-1.5 py-0.5 text-[10px] text-muted ${repo.isPrivate ? 'text-amber-400' : ''}`}>
            {repo.isPrivate ? 'private' : 'public'}
          </span>
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
            {repo.primaryLanguage ?? '—'}
          </span>
        </div>
        {repo.description ? <p className="mt-1 text-sm text-muted">{repo.description}</p> : null}
      </div>

      {notice ? (
        <div className="rounded-md border border-green-500/40 px-3 py-2 text-sm text-green-400">{notice}</div>
      ) : null}
      <ErrorBanner>{error}</ErrorBanner>

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        {['overview', 'pull-requests', 'branches', 'commits', 'issues', 'webhooks'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md border px-3 py-1.5 capitalize ${
              tab === t
                ? 'border-accent bg-accent text-canvas'
                : 'border-line text-muted hover:bg-panel hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!connected && tab !== 'overview' ? (
        <ErrorBanner>
          This view requires a live GitHub connection. Go to Repositories to connect GitHub.
        </ErrorBanner>
      ) : null}

      {tab === 'overview' ? (
        <section className="space-y-4 rounded-lg border border-line bg-panel p-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">Default branch</dt>
              <dd className="mt-1 text-sm text-ink">{repo.defaultBranch}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">Stars</dt>
              <dd className="mt-1 text-sm text-ink">★ {repo.stars}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">Last synced</dt>
              <dd className="mt-1 text-sm text-ink">
                {repo.lastSyncedAt ? new Date(repo.lastSyncedAt).toLocaleString() : 'Never'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">Source</dt>
              <dd className="mt-1 text-sm text-ink">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:opacity-80"
                >
                  {repo.fullName}
                </a>
              </dd>
            </div>
          </dl>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className={buttonClass}>
              {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className={ghostButtonClass}
            >
              Remove repository
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'pull-requests' ? (
        prsQuery.isPending ? (
          <p className="text-sm text-muted">Loading pull requests…</p>
        ) : prsQuery.isError ? (
          <ErrorBanner>{prsQuery.error.message}</ErrorBanner>
        ) : prsQuery.data.length === 0 ? (
          <p className="text-sm text-muted">No pull requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {prsQuery.data.map((pr) => (
              <li key={pr.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
                <span className={`font-mono text-xs ${stateTone[pr.state] ?? 'text-muted'}`}>#{pr.number}</span>
                <span className="text-ink">{pr.title}</span>
                <span className={`text-xs font-medium capitalize ${stateTone[pr.state] ?? 'text-muted'}`}>{pr.state}</span>
                <span className="ml-auto text-xs text-muted">
                  {pr.author ? pr.author : 'unknown'} · +{pr.additions} −{pr.deletions}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'branches' ? (
        branchesQuery.isPending ? (
          <p className="text-sm text-muted">Loading branches…</p>
        ) : branchesQuery.isError ? (
          <ErrorBanner>{branchesQuery.error.message}</ErrorBanner>
        ) : branchesQuery.data.length === 0 ? (
          <p className="text-sm text-muted">No branches.</p>
        ) : (
          <ul className="space-y-2">
            {branchesQuery.data.map((item) => (
              <li key={item.name} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
                <span className="text-ink">{item.name}</span>
                {item.protected ? (
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">protected</span>
                ) : null}
                <span className="ml-auto font-mono text-xs text-muted">{item.sha ? item.sha.slice(0, 7) : '—'}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'commits' ? (
        <>
          <div className="flex items-center gap-3">
            <Field label="Branch">
              <select
                className={`${inputClass} w-64`}
                value={resolvedBranch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value={repo.defaultBranch}>{repo.defaultBranch}</option>
                {(branchesQuery.data ?? [])
                  .filter((b) => b.name !== repo.defaultBranch)
                  .map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          {commitsQuery.isPending ? (
            <p className="text-sm text-muted">Loading commits…</p>
          ) : commitsQuery.isError ? (
            <ErrorBanner>{commitsQuery.error.message}</ErrorBanner>
          ) : commitsQuery.data.length === 0 ? (
            <p className="text-sm text-muted">No commits.</p>
          ) : (
            <ul className="space-y-2">
              {commitsQuery.data.map((commit) => (
                <li key={commit.sha} className="rounded-lg border border-line bg-panel p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink">{commit.message}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted">{commit.sha.slice(0, 7)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {commit.author ? `${commit.author} · ` : ''}
                    {commit.date ? new Date(commit.date).toLocaleString() : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {tab === 'issues' ? (
        issuesQuery.isPending ? (
          <p className="text-sm text-muted">Loading issues…</p>
        ) : issuesQuery.isError ? (
          <ErrorBanner>{issuesQuery.error.message}</ErrorBanner>
        ) : issuesQuery.data.length === 0 ? (
          <p className="text-sm text-muted">No open issues.</p>
        ) : (
          <ul className="space-y-2">
            {issuesQuery.data.map((issue) => (
              <li key={issue.number} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
                <span className="font-mono text-xs text-muted">#{issue.number}</span>
                <span className="text-ink">{issue.title}</span>
                <span className={`text-xs font-medium capitalize ${stateTone[issue.state] ?? 'text-muted'}`}>{issue.state}</span>
                {issue.labels?.map((label) => (
                  <span
                    key={label.name}
                    className="rounded px-1.5 py-0.5 text-[10px] text-canvas"
                    style={{ backgroundColor: label.color || '#6b7280' }}
                  >
                    {label.name}
                  </span>
                ))}
                <span className="ml-auto text-xs text-muted">{issue.author ?? 'unknown'}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'webhooks' ? (
        <section className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              webhookMutation.mutate({ events: webhookEvents });
            }}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-panel p-4"
          >
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">Events</span>
              <div className="flex flex-wrap gap-3 text-sm text-ink">
                {['push', 'pull_request', 'issues'].map((event) => (
                  <label key={event} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes(event)}
                      onChange={() => toggleEvent(event)}
                    />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={webhookMutation.isPending || webhookEvents.length === 0} className={buttonClass}>
              {webhookMutation.isPending ? 'Creating…' : 'Create webhook'}
            </button>
          </form>

          {webhooksQuery.isPending ? (
            <p className="text-sm text-muted">Loading webhooks…</p>
          ) : webhooksQuery.isError ? (
            <ErrorBanner>{webhooksQuery.error.message}</ErrorBanner>
          ) : webhooksQuery.data.length === 0 ? (
            <p className="text-sm text-muted">No webhooks. Create one to keep pull requests in sync on push.</p>
          ) : (
            <ul className="space-y-2">
              {webhooksQuery.data.map((hook) => (
                <li key={hook.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
                  <span className="text-ink">{hook.events.join(', ') || 'no events'}</span>
                  <span className={`text-xs ${hook.active ? 'text-green-400' : 'text-muted'}`}>
                    {hook.active ? 'active' : 'inactive'}
                  </span>
                  <span className="ml-auto font-mono text-xs text-muted">
                    {hook.githubWebhookId ? `#${hook.githubWebhookId}` : 'not registered'}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteWebhookMutation.mutate(hook.id)}
                    className={ghostButtonClass}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
