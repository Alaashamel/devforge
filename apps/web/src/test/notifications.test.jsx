import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../layouts/app-shell.jsx';
import { useNotificationsStore } from '../stores/notifications.js';
import { useAuthStore } from '../stores/auth.js';

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      listOrganizations: vi.fn().mockResolvedValue([]),
      getNotificationUnreadCount: vi.fn().mockResolvedValue({ count: 2 }),
      listNotifications: vi.fn().mockResolvedValue([
        {
          id: 'n1',
          type: 'task.assigned',
          title: 'You were assigned "Fix the bug"',
          href: '/projects/p1/tasks/t1',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n2',
          type: 'task.commented',
          title: 'New comment on "Fix the bug"',
          href: '/projects/p1/tasks/t1',
          readAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]),
      markNotificationRead: vi.fn().mockResolvedValue({}),
      markAllNotificationsRead: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../services/socket.js', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), connected: true })),
  joinRoom: vi.fn(() => Promise.resolve(false)),
  leaveRoom: vi.fn(),
  emitEvent: vi.fn(),
  onRealtime: vi.fn(() => () => {}),
}));

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('notifications', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'me', name: 'Tester' },
      accessToken: 'token',
      refreshToken: 'refresh',
    });
    useNotificationsStore.setState({ unread: 0, items: [], open: false, loading: false });
  });

  it('lists notifications and shows the unread badge when opened', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(
      await screen.findByText('You were assigned "Fix the bug"'),
    ).toBeInTheDocument();
    expect(screen.getByText('New comment on "Fix the bug"')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('marks a notification read on click and decrements the badge', async () => {
    const user = userEvent.setup();
    const { api } = await import('../services/api.js');
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(
      await screen.findByText('You were assigned "Fix the bug"'),
    );

    expect(api.markNotificationRead).toHaveBeenCalledWith('n1');
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('marks all notifications read', async () => {
    const user = userEvent.setup();
    const { api } = await import('../services/api.js');
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByText('Mark all read'));

    expect(api.markAllNotificationsRead).toHaveBeenCalled();
  });

  it('increments the unread count when a notification arrives live', () => {
    useNotificationsStore.getState().handleNew({
      id: 'live-1',
      title: 'Live notification',
      href: '/projects/p1/tasks/t1',
      createdAt: new Date().toISOString(),
    });

    expect(useNotificationsStore.getState().unread).toBe(1);
    expect(useNotificationsStore.getState().items[0].title).toBe('Live notification');
  });
});
