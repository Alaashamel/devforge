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

const severityTone = {
  critical: 'border-red-400/50 text-red-400',
  high: 'border-red-300/40 text-red-300',
  medium: 'border-amber-400/40 text-amber-400',
  low: 'border-blue-400/40 text-blue-400',
  info: 'border-line text-muted',
};

const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];

function SeverityBadge({ severity }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${
        severityTone[severity] ?? severityTone.info
      }`}
    >
      {severity}
    </span>
  );
}

function SeverityCounts({ counts }) {
  const present = (counts ?? {});
  const shown = severityOrder.filter((severity) => (present[severity] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((severity) => (
        <span key={severity} className="flex items-center gap-1.5">
          <SeverityBadge severity={severity} />
          <span className="text-xs text-muted">{present[severity]}</span>
        </span>
      ))}
    </div>
  );
}

function FindingCard({ finding }) {
  const location = [finding.file, finding.line ? `:${finding.line}` : ''].join('');
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <span className="text-sm font-medium text-ink">{finding.title}</span>
        {location ? <span className="ml-auto font-mono text-xs text-muted">{location}</span> : null}
      </div>
      {finding.description ? <p className="mt-2 text-xs text-muted">{finding.description}</p> : null}
      {finding.suggestion ? (
        <p className="mt-1 text-xs text-green-400">Suggestion: {finding.suggestion}</p>
      ) : null}
    </div>
  );
}

function ReviewReport({ report, score, createdAt, model }) {
  const repo = report?.repository;
  const scoreValue = score?.score ?? report?.score?.score;

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-4xl font-semibold tracking-tight text-ink">{scoreValue ?? '—'}</div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted">Review score</div>
            <div className="mt-1 text-xs text-muted">
              {createdAt ? new Date(createdAt).toLocaleString() : ''}
              {model ? ` · ${model}` : ''}
            </div>
          </div>
        </div>
        {report?.summary ? <p className="mt-3 text-sm text-ink">{report.summary}</p> : null}
        {repo?.pull_request_number ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>Pull request #{repo.pull_request_number}</span>
            {report.files_changed !== undefined ? <span>Files changed: {report.files_changed}</span> : null}
            {report.additions !== undefined ? <span>+{report.additions}</span> : null}
            {report.deletions !== undefined ? <span>−{report.deletions}</span> : null}
          </div>
        ) : null}
      </div>

      <SeverityCounts counts={report?.severity_counts} />

      {report?.findings?.length ? (
        <div className="space-y-2">
          {report.findings.map((finding, i) => (
            <FindingCard key={i} finding={finding} />
          ))}
        </div>
      ) : report ? (
        <p className="text-sm text-muted">No findings — this diff looks clean.</p>
      ) : null}
    </section>
  );
}

export function AiCodeReview({ orgId, repoId, prNumber }) {
  const queryClient = useQueryClient();
  const [activeJobId, setActiveJobId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const queryKey = [
    'organizations',
    orgId,
    'repositories',
    repoId,
    'analyses',
    'code_review',
    prNumber,
  ];
  const reviewsQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.listAnalyses(orgId, {
        repositoryId: repoId,
        type: 'code_review',
        pullRequestNumber: prNumber,
      }),
    enabled: Boolean(orgId),
  });

  const runMutation = useMutation({
    mutationFn: () =>
      api.createAnalysis(orgId, {
        repositoryId: repoId,
        type: 'code_review',
        pullRequestNumber: prNumber,
      }),
    onSuccess: async (data) => {
      setActiveJobId(data.jobId);
      setNotice('Review queued — this usually takes a minute.');
      setError(null);
      let job;
      try {
        job = await waitForJob(orgId, data.jobId);
      } finally {
        setActiveJobId(null);
      }
      if (job.status === 'succeeded') {
        setNotice('Review complete.');
        setError(null);
      } else {
        setError(job.error || 'Review failed.');
        setNotice(null);
      }
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err.message),
  });

  const running = runMutation.isPending || Boolean(activeJobId);
  const reviews = reviewsQuery.data ?? [];
  const latest = reviews[0];

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink">AI code review</h3>
            <p className="mt-0.5 text-xs text-muted">Severity-classified findings for this pull request.</p>
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={running}
            onClick={() => runMutation.mutate()}
          >
            {running ? (activeJobId ? 'Reviewing…' : 'Starting…') : 'Run review'}
          </button>
        </div>
        {notice ? <p className="mt-3 text-xs text-green-400">{notice}</p> : null}
        <ErrorBanner>{error}</ErrorBanner>
      </div>

      {reviewsQuery.isPending ? (
        <p className="text-sm text-muted">Loading reviews…</p>
      ) : reviewsQuery.isError ? (
        <ErrorBanner>{reviewsQuery.error.message}</ErrorBanner>
      ) : latest ? (
        <ReviewReport
          report={latest.report}
          score={latest.score}
          createdAt={latest.createdAt}
          model={latest.model}
        />
      ) : (
        <p className="text-sm text-muted">No review yet for this pull request.</p>
      )}
    </section>
  );
}
