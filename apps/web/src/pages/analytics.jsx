import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../services/api.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { StatCard } from '../components/stat-card.jsx';
import { StatusPill } from '../components/status-pill.jsx';
import { ErrorBanner } from '../components/form.jsx';

const healthTone = {
  healthy: 'good',
  degraded: 'warning',
  critical: 'danger',
  'no-data': 'neutral',
};

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{title}</div>
      {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Analytics() {
  const orgId = useWorkspaceStore((s) => s.orgId);

  const overview = useQuery({
    queryKey: ['organizations', orgId, 'analytics', 'overview'],
    queryFn: () => api.getAnalyticsOverview(orgId),
    enabled: Boolean(orgId),
  });
  const velocity = useQuery({
    queryKey: ['organizations', orgId, 'analytics', 'velocity', 12],
    queryFn: () => api.getAnalyticsVelocity(orgId, { weeks: 12 }),
    enabled: Boolean(orgId),
  });
  const health = useQuery({
    queryKey: ['organizations', orgId, 'analytics', 'health'],
    queryFn: () => api.getAnalyticsHealth(orgId),
    enabled: Boolean(orgId),
  });
  const developers = useQuery({
    queryKey: ['organizations', orgId, 'analytics', 'developers', 12],
    queryFn: () => api.getAnalyticsDevelopers(orgId, { weeks: 12 }),
    enabled: Boolean(orgId),
  });
  const repositories = useQuery({
    queryKey: ['organizations', orgId, 'analytics', 'repositories'],
    queryFn: () => api.listRepositoryAnalytics(orgId),
    enabled: Boolean(orgId),
  });

  const pending = overview.isPending || velocity.isPending || health.isPending;
  const error = overview.error ?? velocity.error ?? health.error;

  const completionRatio = overview.data?.completionRatio ?? 0;
  const healthStatus = health.data?.status ?? 'no-data';

  const contributors = overview.data?.topContributors ?? [];
  const recentMerged = overview.data?.recentMerged ?? [];
  const weekly = velocity.data?.series ?? [];
  const developerList = developers.data?.developers ?? [];
  const repositoryList = repositories.data?.repositories ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Phase 6 — team velocity, health and repository activity across the organization.
        </p>
      </div>

      {!orgId ? (
        <p className="text-sm text-muted">You are not part of an organization yet.</p>
      ) : pending ? (
        <p className="text-sm text-muted">Loading analytics…</p>
      ) : error ? (
        <ErrorBanner>{error.message}</ErrorBanner>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Repositories" value={overview.data?.repositories ?? 0} mono />
            <StatCard label="Pull requests" value={overview.data?.pullRequests ?? 0} mono />
            <StatCard label="Additions" value={overview.data?.additions ?? 0} mono />
            <StatCard label="Tasks done" value={overview.data?.tasksDone ?? 0} mono />
            <StatCard
              label="Health"
              value={health.score === null ? healthStatus : `${health.score}`}
              tone={healthTone[healthStatus]}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard
                title="Weekly velocity"
                subtitle={`PRs merged, tasks completed and issues closed per week (last ${velocity.data?.window?.weeks ?? 12} weeks)`}
              >
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                      <defs>
                        <linearGradient id="velPrs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f8cff" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#4f8cff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area
                        type="monotone"
                        dataKey="mergedPrs"
                        name="Merged PRs"
                        stroke="#4f8cff"
                        fill="url(#velPrs)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="completedTasks"
                        name="Tasks completed"
                        stroke="#34d399"
                        fill="transparent"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="issuesClosed"
                        name="Issues closed"
                        stroke="#fbbf24"
                        fill="transparent"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            <div className="space-y-4">
              <ChartCard title="Health breakdown" subtitle={`Score ${health.score ?? '—'}/100`}>
                <div className="flex flex-wrap gap-2">
                  <StatusPill
                    label={`Status: ${healthStatus}`}
                    tone={healthTone[healthStatus]}
                  />
                  <StatusPill
                    label={`Merge rate: ${Math.round((health.data?.components?.mergeRate ?? 0) * 100)}%`}
                  />
                  <StatusPill
                    label={`Tasks done: ${Math.round((health.data?.components?.taskCompletion ?? 0) * 100)}%`}
                  />
                  <StatusPill
                    label={`Issues closed: ${Math.round((health.data?.components?.issueCloseRate ?? 0) * 100)}%`}
                  />
                  <StatusPill
                    label={`Reviewed: ${Math.round((health.data?.components?.reviewCoverage ?? 0) * 100)}%`}
                  />
                </div>
              </ChartCard>

              <ChartCard title="Completion" subtitle="Done tasks vs. total tasks">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Done', value: overview.data?.tasksDone ?? 0 },
                        { name: 'Remaining', value: (overview.data?.tasks ?? 0) - (overview.data?.tasksDone ?? 0) },
                      ]}
                      margin={{ top: 4, right: 8, bottom: 0, left: -24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="value" name="Tasks" fill="#4f8cff" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-muted">{Math.round(completionRatio * 100)}% complete</p>
              </ChartCard>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel">
              <div className="border-b border-line p-4 text-[11px] font-medium uppercase tracking-wider text-muted">
                Top contributors
              </div>
              {contributors.length === 0 ? (
                <p className="p-4 text-sm text-muted">No merged pull requests yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="px-4 py-2 font-medium">Author</th>
                      <th className="px-4 py-2 text-right font-medium">Merged</th>
                      <th className="px-4 py-2 text-right font-medium">Additions</th>
                      <th className="px-4 py-2 text-right font-medium">Deletions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributors.map((c) => (
                      <tr key={c.author} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2">{c.author}</td>
                        <td className="px-4 py-2 text-right font-mono">{c.merged}</td>
                        <td className="px-4 py-2 text-right font-mono text-green-400">+{c.additions}</td>
                        <td className="px-4 py-2 text-right font-mono text-red-400">-{c.deletions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border border-line bg-panel">
              <div className="border-b border-line p-4 text-[11px] font-medium uppercase tracking-wider text-muted">
                Recently merged
              </div>
              {recentMerged.length === 0 ? (
                <p className="p-4 text-sm text-muted">No merged pull requests yet.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {recentMerged.map((pr) => (
                    <li key={pr.number} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm">#{pr.number} {pr.title}</p>
                        <p className="text-xs text-muted">
                          {pr.author} · {pr.repository}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">
                        {pr.mergedAt ? new Date(pr.mergedAt).toLocaleDateString() : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel">
            <div className="border-b border-line p-4 text-[11px] font-medium uppercase tracking-wider text-muted">
              Developers
            </div>
            {developerList.length === 0 ? (
              <p className="p-4 text-sm text-muted">No active team members found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-4 py-2 font-medium">Developer</th>
                    <th className="px-4 py-2 text-right font-medium">Tasks done</th>
                    <th className="px-4 py-2 text-right font-medium">Velocity</th>
                    <th className="px-4 py-2 text-right font-medium">PRs merged</th>
                    <th className="px-4 py-2 text-right font-medium">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {developerList.map((dev) => (
                    <tr key={dev.userId} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2">
                        <span className="font-medium">{dev.name}</span>
                        <span className="ml-2 text-xs text-muted">{dev.email}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {dev.tasksCompleted}/{dev.tasksAssigned}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{dev.velocityPoints}</td>
                      <td className="px-4 py-2 text-right font-mono">{dev.mergedPrs}</td>
                      <td className="px-4 py-2 text-right">
                        {dev.healthScore === null ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <StatusPill
                            label={`${dev.healthScore}`}
                            tone={dev.healthScore >= 75 ? 'good' : dev.healthScore >= 50 ? 'warning' : 'danger'}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border border-line bg-panel">
            <div className="border-b border-line p-4 text-[11px] font-medium uppercase tracking-wider text-muted">
              Repository activity
            </div>
            {repositoryList.length === 0 ? (
              <p className="p-4 text-sm text-muted">No repositories yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-4 py-2 font-medium">Repository</th>
                    <th className="px-4 py-2 text-right font-medium">PRs</th>
                    <th className="px-4 py-2 text-right font-medium">Open</th>
                    <th className="px-4 py-2 text-right font-medium">Merged</th>
                    <th className="px-4 py-2 text-right font-medium">Additions</th>
                    <th className="px-4 py-2 text-right font-medium">Deletions</th>
                  </tr>
                </thead>
                <tbody>
                  {repositoryList.map((repo) => (
                    <tr key={repo.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2">
                        <Link to={`/repositories/${repo.id}`} className="font-medium hover:text-accent">
                          {repo.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{repo.totalPrs}</td>
                      <td className="px-4 py-2 text-right font-mono">{repo.openPrs}</td>
                      <td className="px-4 py-2 text-right font-mono text-green-400">{repo.mergedPrs}</td>
                      <td className="px-4 py-2 text-right font-mono">+{repo.additions}</td>
                      <td className="px-4 py-2 text-right font-mono text-red-400">-{repo.deletions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
