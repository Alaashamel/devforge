import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiAssistantTab } from '../components/ai-assistant-tab.jsx';
import { api } from '../services/api.js';

const state = vi.hoisted(() => ({
  conversations: [],
  messages: [],
  streamEvents: [],
  streamRejects: false,
}));

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      listConversations: vi.fn(async () => state.conversations),
      createConversation: vi.fn(async () => {
        const conversation = { id: 'c-new', title: 'New conversation', messageCount: 0 };
        state.conversations = [conversation, ...state.conversations];
        return conversation;
      }),
      deleteConversation: vi.fn(async () => {
        state.conversations = state.conversations.filter(() => false);
        return { deleted: true };
      }),
      listMessages: vi.fn(async () => state.messages),
      streamAssistantReply: vi.fn(async (_orgId, _convId, content, onEvent) => {
        if (state.streamRejects) {
          throw new Error('AI service unreachable');
        }
        for (const event of state.streamEvents) {
          onEvent(event);
        }
        const answer = state.streamEvents
          .filter((e) => e.type === 'delta')
          .map((e) => e.text)
          .join('');
        const sources = state.streamEvents.find((e) => e.type === 'sources')?.sources ?? [];
        state.messages = [
          ...state.messages,
          { id: 'm-new-user', role: 'user', content, sources: [] },
          { id: 'm-new-assistant', role: 'assistant', content: answer, sources },
        ];
        return undefined;
      }),
    },
  };
});

function renderAssistant(orgId = 'org-1', repoId = 'r-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AiAssistantTab orgId={orgId} repoId={repoId} />
    </QueryClientProvider>,
  );
}

describe('AiAssistantTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.conversations = [{ id: 'c-1', title: 'Chat about repo', messageCount: 2 }];
    state.messages = [
      { id: 'm-1', role: 'user', content: 'What is this?', sources: [] },
      {
        id: 'm-2',
        role: 'assistant',
        content: 'It is a devtool.',
        sources: [{ path: 'README.md', language: 'Markdown' }],
      },
    ];
    state.streamEvents = [];
    state.streamRejects = false;
  });

  it('lists conversations and renders the thread for the active one', async () => {
    renderAssistant();

    expect(await screen.findByText('Chat about repo')).toBeInTheDocument();
    expect(await screen.findByText('What is this?')).toBeInTheDocument();
    expect(await screen.findByText('It is a devtool.')).toBeInTheDocument();
    expect(api.listMessages).toHaveBeenCalledWith('org-1', 'c-1');
    expect(screen.getByText('README.md · Markdown')).toBeInTheDocument();
  });

  it('shows an empty state when no conversations exist', async () => {
    state.conversations = [];
    renderAssistant();

    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
    expect(
      screen.getByText('Ask the first question to start a conversation about this repository.'),
    ).toBeInTheDocument();
  });

  it('streams the reply, persists it, and refreshes the thread', async () => {
    state.streamEvents = [
      { type: 'sources', sources: [{ path: 'README.md', score: 0.9 }] },
      { type: 'delta', text: 'Hello ' },
      { type: 'delta', text: 'world' },
      { type: 'done' },
    ];
    renderAssistant();
    await screen.findByText('Chat about repo');

    fireEvent.change(screen.getByPlaceholderText('Ask about this repository…'), {
      target: { value: 'What does this do?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(api.streamAssistantReply).toHaveBeenCalledWith(
        'org-1',
        'c-1',
        'What does this do?',
        expect.any(Function),
      ),
    );
    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    expect(await screen.findByText('What does this do?')).toBeInTheDocument();
    await waitFor(() => expect(api.listMessages).toHaveBeenCalledTimes(2));
  });

  it('disables the send box while a reply is streaming', async () => {
    state.streamEvents = [{ type: 'delta', text: 'typing' }];
    renderAssistant();
    await screen.findByText('Chat about repo');

    const input = screen.getByPlaceholderText('Ask about this repository…');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Replying…' })).toBeDisabled());
  });

  it('shows the error event message and keeps it visible', async () => {
    state.streamEvents = [{ type: 'error', message: 'model stream failed' }];
    renderAssistant();
    await screen.findByText('Chat about repo');

    fireEvent.change(screen.getByPlaceholderText('Ask about this repository…'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('model stream failed')).toBeInTheDocument();
  });

  it('surfaces a request error when streaming fails', async () => {
    state.streamRejects = true;
    renderAssistant();
    await screen.findByText('Chat about repo');

    fireEvent.change(screen.getByPlaceholderText('Ask about this repository…'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('AI service unreachable')).toBeInTheDocument();
  });

  it('creates and selects a new conversation', async () => {
    state.conversations = [];
    renderAssistant();

    fireEvent.click(await screen.findByRole('button', { name: 'New conversation' }));

    await waitFor(() =>
      expect(api.createConversation).toHaveBeenCalledWith('org-1', { repositoryId: 'r-1' }),
    );
    const matches = await screen.findAllByText('New conversation');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('deletes the active conversation', async () => {
    renderAssistant();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Chat about repo' }));

    await waitFor(() => expect(api.deleteConversation).toHaveBeenCalledWith('org-1', 'c-1'));
    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
  });
});
