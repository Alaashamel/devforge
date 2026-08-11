import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { StatCard } from '../components/stat-card.jsx';
import { StatusPill } from '../components/status-pill.jsx';

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function Dashboard() {
  const liveness = useQuery({ queryKey: ['health', 'live'], queryFn: api.getHealth });
  const readiness = useQuery({ queryKey: ['health', 'ready'], queryFn: api.getReady });

  const isLoading = liveness.isPending || readiness.isPending;
  const database = readiness.data?.checks?.database;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Workspace overview</h1>
        <p className="mt-1 text-sm text-muted">
          Phase 1 — application foundation. API integration is live.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Checking service health…</p>
      ) : liveness.error ? (
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-sm font-medium text-red-400">Unable to reach the API</p>
          <p className="mt-1 text-sm text-muted">{liveness.error.message}</p>
          {liveness.error.requestId ? (
            <p className="mt-1 font-mono text-xs text-muted">
              Request ID: {liveness.error.requestId}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              liveness.refetch();
              readiness.refetch();
            }}
            className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel hover:text-ink"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Service" value={liveness.data?.service ?? '—'} mono />
            <StatCard label="Version" value={liveness.data?.version ?? '—'} mono />
            <StatCard label="Uptime" value={formatUptime(liveness.data?.uptime)} mono />
            <StatCard
              label="Status"
              value={readiness.data?.status ?? 'unknown'}
              tone={readiness.data?.status === 'ok' ? 'good' : 'danger'}
            />
          </div>

          <div className="rounded-lg border border-line bg-panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Checks
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill
                label={`Liveness: ${liveness.data?.status ?? 'unknown'}`}
                tone={liveness.data?.status === 'ok' ? 'good' : 'danger'}
              />
              <StatusPill
                label={`Readiness: ${readiness.data?.status ?? 'unknown'}`}
                tone={readiness.data?.status === 'ok' ? 'good' : 'danger'}
              />
              <StatusPill
                label={`Database: ${database ?? 'unknown'}`}
                tone={database === 'up' ? 'good' : database === 'down' ? 'danger' : 'neutral'}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
