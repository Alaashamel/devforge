import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../layouts/app-shell.jsx';

vi.mock('../services/api.js', () => ({
  api: {
    listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Corp' }]),
    listNotifications: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
}));

vi.mock('../services/socket.js', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  onRealtime: vi.fn(() => vi.fn()),
}));

vi.mock('../stores/ui.js', () => ({
  useUiStore: vi.fn((selector) => {
    const state = { theme: 'dark', toggleTheme: vi.fn() };
    return selector(state);
  }),
}));

vi.mock('../stores/auth.js', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { status: 'authenticated', user: { name: 'Tester' }, logout: vi.fn() };
    return selector(state);
  }),
}));

vi.mock('../stores/workspace.js', () => ({
  useWorkspaceStore: vi.fn((selector) => {
    const state = { orgId: 'org-1', selectOrg: vi.fn() };
    return selector(state);
  }),
}));

vi.mock('../stores/notifications.js', () => ({
  useNotificationsStore: Object.assign(
    vi.fn(() => ({ items: [], total: 0, unread: 0, loading: false, refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() })),
    { getState: vi.fn(() => ({ items: [], total: 0, unread: 0 })) },
  ),
}));

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell a11y landmarks', () => {
  it('includes a skip-to-content link targeting the main element', () => {
    renderShell();
    const link = screen.getByRole('link', { name: /skip to main content/i });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('labels the primary navigation landmark', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it('labels the theme toggle button', () => {
    renderShell();
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('labels the organization selector', async () => {
    renderShell();
    const select = await screen.findByRole('combobox', { name: /organization/i });
    expect(select).toBeInTheDocument();
  });

  it('labels the notifications button', () => {
    renderShell();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });
});
