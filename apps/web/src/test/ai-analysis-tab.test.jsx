import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiAnalysisTab } from '../components/ai-analysis-tab.jsx';
import { api } from '../services/api.js';

function buildReport() {
  return {
    id: 'a-1',
    type: 'analyzer',
    status: 'completed',
    model: 'claude-sonnet-4-5',
    score: { overall: 75, health: 72 },
    createdAt: '2026-08-15T00:00:00Z',
    report: {
      summary: 'Solid architecture with good docs, but security needs attention.',
      overall: 75,
      repository: { file_count: 120, dependency_count: 12, languages: { JavaScript: 80, Python: 40 } },
      dimensions: [
        {
          key: 'architecture',
          label: 'Architecture',
          score: 82,
          summary: 'Modular layout with clean boundaries.',
          strengths: ['Clear separation of concerns'],
          risks: ['Monolith may grow'],
          recommendations: ['Extract workers into a service'],
        },
        {
          key: 'code_quality',
          label: 'Code quality',
          score: 74,
          summary: 'Consistent formatting overall.',
          strengths: ['Low duplication'],
          risks: ['Some dead code'],
          recommendations: ['Remove unused branches'],
        },
        {
          key: 'security',
          label: 'Security',
          score: 61,
          summary: 'Basic hygiene but gaps remain.',
          strengths: ['Dependency scanning enabled'],
          risks: ['Tokens in fixtures'],
          recommendations: ['Rotate fixtures'],
        },
        {
          key: 'documentation',
          label: 'Documentation',
          score: 83,
          summary: 'README and ADRs in good shape.',
          strengths: ['ADRs for decisions'],
          risks: ['API docs incomplete'],
          recommendations: ['Document endpoints'],
        },
      ],
    },
  };
}

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  const report = buildReport();
  return {
    ...actual,
    api: {
      ...actual.api,
      listAnalyses: vi.fn().mockResolvedValue([report]),
      createAnalysis: vi.fn().mockResolvedValue({ jobId: 'j-1', status: 'accepted' }),
      getAiJobStatus: vi.fn().mockResolvedValue({
        id: 'j-1',
        type: 'analyzer',
        status: 'succeeded',
        result: {},
      }),
      getAnalysis: vi.fn().mockResolvedValue(report),
    },
  };
});

function renderTab(orgId = 'org-1', repoId = 'r-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AiAnalysisTab orgId={orgId} repoId={repoId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AiAnalysisTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the latest analysis report with dimension cards', async () => {
    renderTab();

    expect(await screen.findByText('75')).toBeInTheDocument();
    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('Code quality')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(
      screen.getByText('Solid architecture with good docs, but security needs attention.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Clear separation of concerns')).toBeInTheDocument();
    expect(screen.getByText('Tokens in fixtures')).toBeInTheDocument();
    expect(screen.getByText('Document endpoints')).toBeInTheDocument();
    expect(screen.getByText(/claude-sonnet-4-5/)).toBeInTheDocument();
  });

  it('shows an empty state when no analyses exist', async () => {
    vi.mocked(api.listAnalyses).mockResolvedValue([]);
    renderTab();

    expect(
      await screen.findByText('No analyses yet. Run one to see a health report.'),
    ).toBeInTheDocument();
  });

  it('shows an error when analyses fail to load', async () => {
    vi.mocked(api.listAnalyses).mockRejectedValue(new Error('Unable to load analyses'));
    renderTab();

    expect(await screen.findByText('Unable to load analyses')).toBeInTheDocument();
  });

  it('queues an analyzer job and shows completion once it succeeds', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Analyze repository' }));

    await waitFor(() =>
      expect(api.createAnalysis).toHaveBeenCalledWith('org-1', {
        repositoryId: 'r-1',
        type: 'analyzer',
      }),
    );
    await waitFor(() => expect(api.getAiJobStatus).toHaveBeenCalledWith('org-1', 'j-1'));
    expect(await screen.findByText('Analysis complete.')).toBeInTheDocument();
  });

  it('surfaces the error when an analysis job fails', async () => {
    vi.mocked(api.getAiJobStatus).mockResolvedValue({
      id: 'j-1',
      type: 'analyzer',
      status: 'failed',
      error: 'provider unavailable',
    });
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Analyze repository' }));

    expect(await screen.findByText('provider unavailable')).toBeInTheDocument();
  });

  it('shows an error when creating an analysis fails', async () => {
    vi.mocked(api.createAnalysis).mockRejectedValue(new Error('Job rejected'));
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Analyze repository' }));

    expect(await screen.findByText('Job rejected')).toBeInTheDocument();
  });
});
