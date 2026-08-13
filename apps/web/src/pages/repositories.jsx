import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { ErrorBanner, Field, buttonClass, ghostButtonClass, inputClass } from '../components/form.jsx';

export function Repositories() {
  const queryClient = useQueryClient();
  const orgId = useWorkspaceStore((s) => s.orgId);
  const [searchParams, setSearchParams] = useSearchParams();

  const connectionQuery = useQuery({
    queryKey: ['github', 'connection'],
    queryFn: api.getGithubConnection,
  });

  const reposQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories'],
    queryFn: () => api.listRepositories(orgId),
    enabled: Boolean(orgId),
  });

  const [showImport, setShowImport] = useState(false);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const oauthNotice = searchParams.get('github');
  const oauthMessage = searchParams.get('message');

  const beginOAuthMutation = useMutation({
    mutationFn: () => api.beginGithubOAuth(),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
    onError: (err) => setError(err.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.disconnectGithub(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github', 'connection'] });
    },
    onError: (err) => setError(err.message),
  });

  const importMutation = useMutation({
    mutationFn: (payload) => api.importRepository(orgId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'repositories'] });
      setShowImport(false);
      setFullName('');
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
      if (err.code === 'GITHUB_NOT_CONNECTED' || err.code === 'GITHUB_TOKEN_EXPIRED') {
        queryClient.invalidateQueries({ queryKey: ['github', 'connection'] });
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: (repoId) => api.syncRepository(orgId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'repositories'] });
      setNotice('Repository synced.');
    },
    onError: (err) => {
      setError(err.message);
      if (err.code === 'GITHUB_NOT_CONNECTED' || err.code === 'GITHUB_TOKEN_EXPIRED') {
        queryClient.invalidateQueries({ queryKey: ['github', 'connection'] });
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: (repoId) => api.deleteRepository(orgId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'repositories'] });
    },
    onError: (err) => setError(err.message),
  });

  function onImport(event) {
    event.preventDefault();
    importMutation.mutate({ fullName });
  }

  const connected = connectionQuery.data?.connected === true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Repositories</h1>
          <p className="mt-1 text-sm text-muted">
            Import GitHub repositories and keep pull requests in sync.
          </p>
        </div>
        {connectionQuery.isPending ? null : connected ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Connected as {connectionQuery.data.login}</span>
            <button
              type="button"
              onClick={() => disconnectMutation.mutate()}
              className={ghostButtonClass}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => beginOAuthMutation.mutate()}
            disabled={beginOAuthMutation.isPending}
            className={buttonClass}
          >
            {beginOAuthMutation.isPending ? 'Redirecting…' : 'Connect GitHub'}
          </button>
        )}
      </div>

      {oauthNotice ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            oauthNotice === 'connected'
              ? 'border-green-500/40 text-green-400'
              : 'border-red-500/40 text-red-400'
          }`}
        >
          {oauthNotice === 'connected'
            ? 'GitHub connected successfully.'
            : oauthMessage || 'GitHub authorization failed.'}
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="ml-3 text-xs text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {notice ? <div className="rounded-md border border-green-500/40 px-3 py-2 text-sm text-green-400">{notice}</div> : null}
      <ErrorBanner>{error}</ErrorBanner>

      {connected && !reposQuery.isPending && !reposQuery.isError ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{reposQuery.data.length} imported repositories</span>
          <button type="button" onClick={() => setShowImport((v) => !v)} className={ghostButtonClass}>
            {showImport ? 'Close' : 'Import repository'}
          </button>
        </div>
      ) : null}

      {showImport ? (
        <form onSubmit={onImport} className="flex items-end gap-3 rounded-lg border border-line bg-panel p-4">
          <div className="flex-1">
            <Field label="Full name">
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="owner/repository"
                pattern="[\w.-]+/[\w.-]+"
                required
              />
            </Field>
          </div>
          <button type="submit" disabled={importMutation.isPending} className={buttonClass}>
            {importMutation.isPending ? 'Importing…' : 'Import'}
          </button>
        </form>
      ) : null}

      {!orgId ? (
        <p className="text-sm text-muted">You are not part of an organization yet.</p>
      ) : reposQuery.isPending ? (
        <p className="text-sm text-muted">Loading repositories…</p>
      ) : reposQuery.isError ? (
        <ErrorBanner>{reposQuery.error.message}</ErrorBanner>
      ) : reposQuery.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          {connected
            ? 'No repositories yet — import one to get started.'
            : 'Connect your GitHub account to import repositories.'}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reposQuery.data.map((repo) => (
            <div key={repo.id} className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {repo.primaryLanguage ?? '—'}
                </span>
                <span className={`text-[11px] font-medium ${repo.isPrivate ? 'text-amber-400' : 'text-muted'}`}>
                  {repo.isPrivate ? 'private' : 'public'}
                </span>
              </div>
              <div className="min-w-0">
                <Link
                  to={`/repositories/${repo.id}`}
                  className="text-sm font-medium text-ink hover:text-accent"
                >
                  {repo.fullName}
                </Link>
                {repo.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{repo.description}</p>
                ) : null}
              </div>
              <div className="mt-auto flex items-center justify-between text-[11px] text-muted">
                <span>★ {repo.stars}</span>
                <span>{repo.lastSyncedAt ? `synced ${new Date(repo.lastSyncedAt).toLocaleDateString()}` : 'never synced'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/repositories/${repo.id}`} className={ghostButtonClass}>
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => syncMutation.mutate(repo.id)}
                  disabled={syncMutation.isPending}
                  className={ghostButtonClass}
                >
                  Sync
                </button>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(repo.id)}
                  className={`${ghostButtonClass} ml-auto`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
