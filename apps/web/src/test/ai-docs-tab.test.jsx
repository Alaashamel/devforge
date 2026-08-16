import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiDocsTab } from '../components/ai-docs-tab.jsx';
import { api } from '../services/api.js';

function buildDocsAnalysis() {
  return {
    id: 'a-docs',
    type: 'readme',
    status: 'completed',
    model: 'claude-sonnet-4-5',
    score: { files: 1 },
    createdAt: '2026-08-15T00:00:00Z',
    report: {
      summary: 'Readme explaining the repo and its usage.',
      repository: {
        name: 'acme/repo',
        file_count: 12,
        languages: { JavaScript: 9, Python: 3 },
      },
      files: [
        {
          path: 'README.md',
          content: '# acme\n\nA sample repository.',
          note: 'Draft covering install and usage.',
        },
      ],
      approvals: [],
    },
  };
}

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  const analysis = buildDocsAnalysis();
  return {
    ...actual,
    api: {
      ...actual.api,
      listAnalyses: vi.fn().mockResolvedValue([analysis]),
      createAnalysis: vi.fn().mockResolvedValue({ jobId: 'j-docs', status: 'accepted' }),
      getAiJobStatus: vi.fn().mockResolvedValue({
        id: 'j-docs',
        type: 'readme',
        status: 'succeeded',
        result: {},
      }),
      getAnalysis: vi.fn().mockResolvedValue(analysis),
      approveAnalysis: vi.fn().mockResolvedValue({
        analysisId: 'a-docs',
        path: 'README.md',
        committed: true,
      }),
    },
  };
});

function renderDocs(orgId = 'org-1', repoId = 'r-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AiDocsTab orgId={orgId} repoId={repoId} />
    </QueryClientProvider>,
  );
}

describe('AiDocsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAnalyses).mockResolvedValue([buildDocsAnalysis()]);
    vi.mocked(api.createAnalysis).mockResolvedValue({ jobId: 'j-docs', status: 'accepted' });
    vi.mocked(api.getAiJobStatus).mockResolvedValue({
      id: 'j-docs',
      type: 'readme',
      status: 'succeeded',
      result: {},
    });
    vi.mocked(api.approveAnalysis).mockResolvedValue({
      analysisId: 'a-docs',
      path: 'README.md',
      committed: true,
    });
  });

  it('renders the latest generated draft with its files and content', async () => {
    renderDocs();

    expect(await screen.findByText('Generated draft')).toBeInTheDocument();
    expect(
      screen.getByText('Readme explaining the repo and its usage.'),
    ).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText(/A sample repository\./)).toBeInTheDocument();
    expect(screen.getByText(/JavaScript \(9\), Python \(3\)/)).toBeInTheDocument();
  });

  it('requests generations for the selected doc type', async () => {
    renderDocs();

    await screen.findByText('Generated draft');
    expect(api.listAnalyses).toHaveBeenCalledWith('org-1', {
      repositoryId: 'r-1',
      type: 'readme',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Docs' }));

    await waitFor(() =>
      expect(api.listAnalyses).toHaveBeenLastCalledWith('org-1', {
        repositoryId: 'r-1',
        type: 'docs',
      }),
    );
  });

  it('shows an empty state when no generations exist', async () => {
    vi.mocked(api.listAnalyses).mockResolvedValue([]);
    renderDocs();

    expect(
      await screen.findByText('No README generated yet. Run one to preview a draft.'),
    ).toBeInTheDocument();
  });

  it('shows an error when generations fail to load', async () => {
    vi.mocked(api.listAnalyses).mockRejectedValue(new Error('Unable to load generations'));
    renderDocs();

    expect(await screen.findByText('Unable to load generations')).toBeInTheDocument();
  });

  it('runs a generation and shows completion once it succeeds', async () => {
    renderDocs();

    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(api.createAnalysis).toHaveBeenCalledWith('org-1', {
        repositoryId: 'r-1',
        type: 'readme',
      }),
    );
    await waitFor(() => expect(api.getAiJobStatus).toHaveBeenCalledWith('org-1', 'j-docs'));
    expect(
      await screen.findByText('Generation complete. Review the draft before committing.'),
    ).toBeInTheDocument();
  });

  it('surfaces the error when a generation job fails', async () => {
    vi.mocked(api.getAiJobStatus).mockResolvedValue({
      id: 'j-docs',
      type: 'readme',
      status: 'failed',
      error: 'model provider unavailable',
    });
    renderDocs();

    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('model provider unavailable')).toBeInTheDocument();
  });

  it('shows an error when creating a generation fails', async () => {
    vi.mocked(api.createAnalysis).mockRejectedValue(new Error('Repository not found'));
    renderDocs();

    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Repository not found')).toBeInTheDocument();
  });

  it('commits the file when the user approves it', async () => {
    renderDocs();

    fireEvent.click(await screen.findByRole('button', { name: 'Approve & commit' }));

    await waitFor(() =>
      expect(api.approveAnalysis).toHaveBeenCalledWith('org-1', 'a-docs', {
        filePath: 'README.md',
      }),
    );
    expect(
      await screen.findByText('Committed README.md to GitHub.'),
    ).toBeInTheDocument();
  });

  it('marks already committed files and hides the approve button', async () => {
    const analysis = buildDocsAnalysis();
    analysis.report.approvals = [
      { path: 'README.md', sha: 'abc123', committedAt: '2026-08-15T01:00:00Z' },
    ];
    vi.mocked(api.listAnalyses).mockResolvedValue([analysis]);
    renderDocs();

    expect(await screen.findByText('committed')).toBeInTheDocument();
    expect(screen.getByText('Already committed to GitHub.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve & commit' })).not.toBeInTheDocument();
  });
});
