import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '../pages/analytics.jsx';
import { useWorkspaceStore } from '../stores/workspace.js';

vi.mock('recharts', () => {
  const passthrough = ({ children }) => children;
  return {
    ResponsiveContainer: passthrough,
    AreaChart: passthrough,
    BarChart: passthrough,
    CartesianGrid: passthrough,
    Tooltip: passthrough,
    Legend: passthrough,
    Area: () => null,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      getAnalyticsOverview: vi.fn().mockResolvedValue({
        repositories: 2,
        pullRequests: 9,
        additions: 1200,
        deletions: 300,
        projects: 1,
        tasks: 12,
        tasksDone: 6,
        completionRatio: 0.5,
        topContributors: [{ author: 'alaa-devforge', merged: 5, additions: 900, deletions: 100 }],
        recentMerged: [
          {
            number: 9,
            title: 'feat(analytics): velocity dashboard',
            author: 'alaa-devforge',
            repository: 'acme/devforge',
            mergedAt: '2026-08-10T00:00:00Z',
          },
        ],
      }),
      getAnalyticsVelocity: vi.fn().mockResolvedValue({
        window: { start: '2026-05-25', end: '2026-08-10', weeks: 12 },
        series: [
          { period: '2026-08-10', mergedPrs: 1, completedTasks: 2, issuesClosed: 1, reviewsCompleted: 0 },
        ],
        totals: { mergedPrs: 1, completedTasks: 2, issuesClosed: 1, reviewsCompleted: 0 },
      }),
      getAnalyticsHealth: vi.fn().mockResolvedValue({
        score: 72,
        status: 'degraded',
        components: { taskCompletion: 0.5, mergeRate: 0.8, issueCloseRate: 0.5, reviewCoverage: 0.2 },
        breakdown: {},
      }),
      getAnalyticsDevelopers: vi.fn().mockResolvedValue({
        developers: [
          {
            userId: 'u-1',
            name: 'Alaa',
            email: 'alaa@acme.dev',
            avatarUrl: null,
            tasksAssigned: 4,
            tasksCompleted: 3,
            velocityPoints: 11,
            mergedPrs: 5,
            additions: 900,
            deletions: 100,
            healthScore: 75,
          },
        ],
      }),
      listRepositoryAnalytics: vi.fn().mockResolvedValue({
        repositories: [
          { id: 'r-1', fullName: 'acme/devforge', totalPrs: 9, openPrs: 2, mergedPrs: 6, closedPrs: 1, additions: 1200, deletions: 300 },
        ],
      }),
      getRepositoryAnalytics: vi.fn().mockResolvedValue({ data: {} }),
    },
  };
});

function renderAnalytics(orgId = 'org-1') {
  useWorkspaceStore.setState({ orgId });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Analytics page', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ orgId: null });
  });

  it('renders overview stats, health, contributors and repository tables', async () => {
    renderAnalytics();

    expect(await screen.findByText('Analytics')).toBeInTheDocument();
    expect(await screen.findByText('Repositories')).toBeInTheDocument();
    expect(screen.getByText('Pull requests')).toBeInTheDocument();
    expect(screen.getByText('Weekly velocity')).toBeInTheDocument();
    expect(screen.getByText('Health breakdown')).toBeInTheDocument();

    expect(await screen.findByText('alaa-devforge')).toBeInTheDocument();
    expect(screen.getByText('#9 feat(analytics): velocity dashboard')).toBeInTheDocument();
    expect(screen.getByText('Alaa')).toBeInTheDocument();
    expect(screen.getByText('acme/devforge')).toBeInTheDocument();
  });

  it('shows a notice when no organization is selected', () => {
    renderAnalytics(null);

    expect(
      screen.getByText('You are not part of an organization yet.'),
    ).toBeInTheDocument();
  });
});
