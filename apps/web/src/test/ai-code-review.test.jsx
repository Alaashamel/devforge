import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiCodeReview } from '../components/ai-code-review.jsx';
import { api } from '../services/api.js';

function buildReview() {
  return {
    id: 'cr-1',
    type: 'code_review',
    status: 'completed',
    model: 'claude-sonnet-4-5',
    score: { score: 68, breakdown: { critical: 1, high: 1, info: 1 }, max: 100 },
    createdAt: '2026-08-15T00:00:00Z',
    report: {
      summary: 'Solid diff overall, but the db change needs attention.',
      pull_request_number: 7,
      files_changed: 3,
      additions: 40,
      deletions: 12,
      severity_counts: { critical: 1, high: 1, info: 1 },
      repository: { name: 'acme/repo', pull_request_number: 7 },
      findings: [
        {
          severity: 'critical',
          file: 'src/db.js',
          line: 12,
          title: 'SQL injection',
          description: 'User input is interpolated into a query.',
          suggestion: 'Use parameterized queries.',
        },
        {
          severity: 'info',
          file: 'src/app.js',
          line: 3,
          title: 'Trailing whitespace',
          description: 'Minor style issue.',
          suggestion: 'Trim the line.',
        },
      ],
    },
  };
}

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  const review = buildReview();
  return {
    ...actual,
    api: {
      ...actual.api,
      listAnalyses: vi.fn().mockResolvedValue([review]),
      createAnalysis: vi.fn().mockResolvedValue({ jobId: 'j-cr', status: 'accepted' }),
      getAiJobStatus: vi.fn().mockResolvedValue({
        id: 'j-cr',
        type: 'code_review',
        status: 'succeeded',
        result: {},
      }),
      getAnalysis: vi.fn().mockResolvedValue(review),
    },
  };
});

function renderReview(orgId = 'org-1', repoId = 'r-1', prNumber = 7) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AiCodeReview orgId={orgId} repoId={repoId} prNumber={prNumber} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AiCodeReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the latest review with findings and severity counts', async () => {
    renderReview();

    expect(await screen.findByText('68')).toBeInTheDocument();
    expect(
      screen.getByText('Solid diff overall, but the db change needs attention.'),
    ).toBeInTheDocument();
    expect(screen.getByText('SQL injection')).toBeInTheDocument();
    expect(screen.getByText('src/db.js:12')).toBeInTheDocument();
    expect(screen.getByText(/Suggestion: Use parameterized queries\./)).toBeInTheDocument();
    expect(screen.getByText('Trailing whitespace')).toBeInTheDocument();
    expect(screen.getAllByText('critical').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/claude-sonnet-4-5/)).toBeInTheDocument();
  });

  it('filters analyses by the pull request number', async () => {
    renderReview('org-1', 'r-1', 42);

    await screen.findByText('68');
    expect(api.listAnalyses).toHaveBeenCalledWith('org-1', {
      repositoryId: 'r-1',
      type: 'code_review',
      pullRequestNumber: 42,
    });
  });

  it('shows an empty state when no reviews exist', async () => {
    vi.mocked(api.listAnalyses).mockResolvedValue([]);
    renderReview();

    expect(
      await screen.findByText('No review yet for this pull request.'),
    ).toBeInTheDocument();
  });

  it('shows an error when reviews fail to load', async () => {
    vi.mocked(api.listAnalyses).mockRejectedValue(new Error('Unable to load reviews'));
    renderReview();

    expect(await screen.findByText('Unable to load reviews')).toBeInTheDocument();
  });

  it('runs a review and shows completion once it succeeds', async () => {
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Run review' }));

    await waitFor(() =>
      expect(api.createAnalysis).toHaveBeenCalledWith('org-1', {
        repositoryId: 'r-1',
        type: 'code_review',
        pullRequestNumber: 7,
      }),
    );
    await waitFor(() => expect(api.getAiJobStatus).toHaveBeenCalledWith('org-1', 'j-cr'));
    expect(await screen.findByText('Review complete.')).toBeInTheDocument();
  });

  it('surfaces the error when a review job fails', async () => {
    vi.mocked(api.getAiJobStatus).mockResolvedValue({
      id: 'j-cr',
      type: 'code_review',
      status: 'failed',
      error: 'model provider unavailable',
    });
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Run review' }));

    expect(await screen.findByText('model provider unavailable')).toBeInTheDocument();
  });

  it('shows an error when creating a review fails', async () => {
    vi.mocked(api.createAnalysis).mockRejectedValue(new Error('Pull request not found'));
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Run review' }));

    expect(await screen.findByText('Pull request not found')).toBeInTheDocument();
  });
});
