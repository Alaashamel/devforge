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

const DOC_TYPES = [
  { key: 'readme', label: 'README', description: 'A single README.md draft.' },
  { key: 'docs', label: 'Docs', description: 'A set of markdown files under docs/.' },
];

function FileCard({ file, approved, committing, onApprove }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-ink">{file.path}</span>
        {approved ? (
          <span className="rounded border border-green-500/40 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-400">
            committed
          </span>
        ) : null}
        <span className="ml-auto">
          {approved ? (
            <span className="text-xs text-muted">Already committed to GitHub.</span>
          ) : (
            <button
              type="button"
              className={buttonClass}
              disabled={committing}
              onClick={() => onApprove(file.path)}
            >
              {committing ? 'Committing…' : 'Approve & commit'}
            </button>
          )}
        </span>
      </div>
      {file.note ? <p className="mt-1 text-xs text-muted">{file.note}</p> : null}
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded border border-line bg-panel p-3 font-mono text-xs text-ink">
        {file.content}
      </pre>
    </div>
  );
}

function DocsReport({ report, createdAt, model, onApprove, committingPath }) {
  const repo = report?.repository;
  const approvedPaths = new Set((report?.approvals ?? []).map((a) => a.path));

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">Generated draft</div>
        <div className="mt-1 text-xs text-muted">
          {createdAt ? new Date(createdAt).toLocaleString() : ''}
          {model ? ` · ${model}` : ''}
        </div>
        {report?.summary ? <p className="mt-3 text-sm text-ink">{report.summary}</p> : null}
        {repo ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>Files: {repo.file_count}</span>
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
        <p className="mt-3 text-xs text-muted">
          Review the draft below — approving it commits the file to GitHub.
        </p>
      </div>

      {report?.files?.length ? (
        <div className="space-y-3">
          {report.files.map((file) => (
            <FileCard
              key={file.path}
              file={file}
              approved={approvedPaths.has(file.path)}
              committing={committingPath === file.path}
              onApprove={onApprove}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function AiDocsTab({ orgId, repoId }) {
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState('readme');
  const [activeJobId, setActiveJobId] = useState(null);
  const [committingPath, setCommittingPath] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const queryKey = ['organizations', orgId, 'repositories', repoId, 'analyses', docType];
  const analysesQuery = useQuery({
    queryKey,
    queryFn: () => api.listAnalyses(orgId, { repositoryId: repoId, type: docType }),
    enabled: Boolean(orgId),
  });

  const runMutation = useMutation({
    mutationFn: () => api.createAnalysis(orgId, { repositoryId: repoId, type: docType }),
    onSuccess: async (data) => {
      setActiveJobId(data.jobId);
      setNotice('Generation queued — this usually takes a minute.');
      setError(null);
      let job;
      try {
        job = await waitForJob(orgId, data.jobId);
      } finally {
        setActiveJobId(null);
      }
      if (job.status === 'succeeded') {
        setNotice('Generation complete. Review the draft before committing.');
        setError(null);
      } else {
        setError(job.error || 'Generation failed.');
        setNotice(null);
      }
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: ({ analysisId, filePath }) =>
      api.approveAnalysis(orgId, analysisId, { filePath }),
    onSuccess: (data, variables) => {
      setNotice(`Committed ${variables.filePath} to GitHub.`);
      setError(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err.message),
  });

  const running = runMutation.isPending || Boolean(activeJobId);
  const analyses = analysesQuery.data ?? [];
  const latest = analyses.find((a) => a.status === 'completed') ?? analyses[0];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">Documentation generator</h2>
            <p className="mt-0.5 text-xs text-muted">
              AI drafts README or docs files you preview and approve — approval commits to GitHub.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            {DOC_TYPES.map((type) => (
              <button
                key={type.key}
                type="button"
                disabled={running}
                onClick={() => setDocType(type.key)}
                className={`rounded-md border px-3 py-1.5 capitalize ${
                  docType === type.key
                    ? 'border-accent bg-accent text-canvas'
                    : 'border-line text-muted hover:bg-panel hover:text-ink'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={running}
            onClick={() => runMutation.mutate()}
          >
            {running ? (activeJobId ? 'Generating…' : 'Starting…') : 'Generate'}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {DOC_TYPES.find((t) => t.key === docType).description}
        </p>
        {notice ? <p className="mt-3 text-xs text-green-400">{notice}</p> : null}
        <ErrorBanner>{error}</ErrorBanner>
      </div>

      {analysesQuery.isPending ? (
        <p className="text-sm text-muted">Loading generations…</p>
      ) : analysesQuery.isError ? (
        <ErrorBanner>{analysesQuery.error.message}</ErrorBanner>
      ) : latest ? (
        <DocsReport
          report={latest.report}
          createdAt={latest.createdAt}
          model={latest.model}
          committingPath={committingPath}
          onApprove={async (filePath) => {
            setCommittingPath(filePath);
            try {
              await approveMutation.mutateAsync({ analysisId: latest.id, filePath });
            } finally {
              setCommittingPath(null);
            }
          }}
        />
      ) : (
        <p className="text-sm text-muted">
          No {docType === 'readme' ? 'README' : 'docs'} generated yet. Run one to preview a draft.
        </p>
      )}
    </section>
  );
}
