import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { buttonClass, ErrorBanner } from './form.jsx';

const JOB_POLL_INTERVAL_MS = 2000;

async function waitForJob(orgId, jobId, intervalMs = JOB_POLL_INTERVAL_MS) {
  for (;;) {
    const status = await api.getAiJobStatus(orgId, jobId);
    if (status.status === 'succeeded' || status.status === 'failed') return status;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function scoreClass(score) {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function BulletList({ label, items, tone }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <ul className={`mt-1 space-y-1 text-xs ${tone}`}>
        {items.map((item, i) => (
          <li key={i} className="list-inside list-disc">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DimensionCard({ dimension }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{dimension.label}</span>
        <span className={`text-lg font-semibold ${scoreClass(dimension.score)}`}>{dimension.score}</span>
      </div>
      {dimension.summary ? <p className="mt-1 text-xs text-muted">{dimension.summary}</p> : null}
      <BulletList label="Strengths" items={dimension.strengths} tone="text-green-400" />
      <BulletList label="Risks" items={dimension.risks} tone="text-amber-400" />
      <BulletList label="Recommendations" items={dimension.recommendations} tone="text-ink" />
    </div>
  );
}

function AnalysisReport({ report, score, createdAt, model }) {
  const overall = report?.overall ?? score?.overall;
  const repo = report?.repository;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-4xl font-semibold tracking-tight text-ink">{overall ?? '—'}</div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted">Overall health</div>
            <div className="mt-1 text-xs text-muted">
              {createdAt ? new Date(createdAt).toLocaleString() : ''}
              {model ? ` · ${model}` : ''}
            </div>
          </div>
        </div>
        {report?.summary ? <p className="mt-3 text-sm text-ink">{report.summary}</p> : null}
        {repo ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>Files: {repo.file_count}</span>
            <span>Dependencies: {repo.dependency_count}</span>
            {repo.languages ? (
              <span>
                Languages:{' '}
                {Object.entries(repo.languages)
                  .map(([name, count]) => `${name} (${count})`)
                  .join(', ')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {report?.dimensions?.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {report.dimensions.map((dimension) => (
            <DimensionCard key={dimension.key} dimension={dimension} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function AiAnalysisTab({ orgId, repoId }) {
  const queryClient = useQueryClient();
  const [activeJobId, setActiveJobId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const analysesQuery = useQuery({
    queryKey: ['organizations', orgId, 'repositories', repoId, 'analyses'],
    queryFn: () => api.listAnalyses(orgId, { repositoryId: repoId }),
    enabled: Boolean(orgId),
  });

  const runMutation = useMutation({
    mutationFn: () => api.createAnalysis(orgId, { repositoryId: repoId, type: 'analyzer' }),
    onSuccess: async (data) => {
      setActiveJobId(data.jobId);
      setNotice('Analysis queued — this usually takes a minute.');
      setError(null);
      let job;
      try {
        job = await waitForJob(orgId, data.jobId);
      } finally {
        setActiveJobId(null);
      }
      if (job.status === 'succeeded') {
        setNotice('Analysis complete.');
        setError(null);
      } else {
        setError(job.error || 'Analysis failed.');
        setNotice(null);
      }
      queryClient.invalidateQueries({
        queryKey: ['organizations', orgId, 'repositories', repoId, 'analyses'],
      });
    },
    onError: (err) => setError(err.message),
  });

  const running = runMutation.isPending || Boolean(activeJobId);

  const analyses = analysesQuery.data ?? [];
  const latest = analyses[0];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">Repository analysis</h2>
            <p className="mt-0.5 text-xs text-muted">
              AI assessment across architecture, code quality, security and documentation.
            </p>
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={running}
            onClick={() => runMutation.mutate()}
          >
            {running ? (activeJobId ? 'Analyzing…' : 'Starting…') : 'Analyze repository'}
          </button>
        </div>
        {notice ? <p className="mt-3 text-xs text-green-400">{notice}</p> : null}
        <ErrorBanner>{error}</ErrorBanner>
      </div>

      {analysesQuery.isPending ? (
        <p className="text-sm text-muted">Loading analyses…</p>
      ) : analysesQuery.isError ? (
        <ErrorBanner>{analysesQuery.error.message}</ErrorBanner>
      ) : latest ? (
        <AnalysisReport
          report={latest.report}
          score={latest.score}
          createdAt={latest.createdAt}
          model={latest.model}
        />
      ) : (
        <p className="text-sm text-muted">No analyses yet. Run one to see a health report.</p>
      )}
    </section>
  );
}
