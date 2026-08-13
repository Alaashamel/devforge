import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Chat } from '../pages/chat.jsx';
import { useAuthStore } from '../stores/auth.js';
import { useWorkspaceStore } from '../stores/workspace.js';

const { socketMock } = vi.hoisted(() => {
  const listeners = new Map();
  const socket = {
    connected: true,
    connect: () => {},
    on: (event, handler) => {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
    },
    off: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
    emitClient: (event, payload) => {
      for (const handler of [...(listeners.get(event) ?? [])]) {
        handler(payload);
      }
    },
    timeout: () => ({
      emit: (_event, _payload, cb) => cb?.(null, { ok: true, online: [] }),
    }),
  };
  return { socketMock: socket };
});

vi.mock('../services/socket.js', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => socketMock),
  joinRoom: vi.fn(() => Promise.resolve(true)),
  leaveRoom: vi.fn(),
  emitEvent: vi.fn(),
  onRealtime: vi.fn(() => () => {}),
}));

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      listChatMessages: vi.fn().mockResolvedValue([]),
      listOrganizationMembers: vi.fn().mockResolvedValue([
        { id: 'alice', name: 'Alice', email: 'alice@devforge.test' },
      ]),
      sendChatMessage: vi.fn(),
    },
  };
});

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Chat />
    </QueryClientProvider>,
  );
}

function nowIso() {
  return new Date().toISOString();
}

describe('Chat', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'me', name: 'Me' },
      accessToken: 'token',
      refreshToken: 'refresh',
    });
    useWorkspaceStore.setState({ orgId: 'org-1' });
  });

  it('renders the empty state before any messages', async () => {
    renderChat();
    expect(await screen.findByText('No messages yet. Say hello to the team.')).toBeInTheDocument();
  });

  it('sends a message and shows it in the thread', async () => {
    const user = userEvent.setup();
    const { api } = await import('../services/api.js');
    api.sendChatMessage.mockResolvedValue({
      data: {
        id: 'm1',
        body: 'Hello team',
        author: { id: 'me', name: 'Me' },
        createdAt: nowIso(),
      },
    });
    renderChat();

    await user.type(screen.getByLabelText('Message'), 'Hello team');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(api.sendChatMessage).toHaveBeenCalledWith('org-1', { body: 'Hello team' });
    expect(await screen.findByText('Hello team')).toBeInTheDocument();
  });

  it('appends messages received over the socket', async () => {
    renderChat();

    socketMock.emitClient('chat:message', {
      message: {
        id: 'm2',
        body: 'Live message',
        author: { id: 'alice', name: 'Alice' },
        createdAt: nowIso(),
      },
    });

    expect(await screen.findByText('Live message')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  });

  it('shows a typing indicator from another member', async () => {
    renderChat();

    socketMock.emitClient('chat:typing', { userId: 'alice', orgId: 'org-1' });

    expect(await screen.findByText('Alice is typing…')).toBeInTheDocument();
  });
});
