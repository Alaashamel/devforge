import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { buttonClass, ErrorBanner, inputClass } from './form.jsx';

function SourceChip({ source }) {
  const path = source?.path ?? 'source';
  const label = source?.language ? `${path} · ${source.language}` : path;
  return (
    <span
      title={source?.content ?? ''}
      className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted"
    >
      {label}
    </span>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg border px-3 py-2 text-sm ${
          isUser ? 'border-accent bg-accent text-canvas' : 'border-line bg-panel text-ink'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser && (message.sources ?? []).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(message.sources ?? []).map((source, index) => (
              <SourceChip key={`${source.path}-${index}`} source={source} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AiAssistantTab({ orgId, repoId }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [streaming, setStreaming] = useState(null);
  const bottomRef = useRef(null);

  const conversationsKey = ['organizations', orgId, 'repositories', repoId, 'conversations'];
  const conversationsQuery = useQuery({
    queryKey: conversationsKey,
    queryFn: () => api.listConversations(orgId, { repositoryId: repoId }),
    enabled: Boolean(orgId),
  });
  const conversations = conversationsQuery.data ?? [];
  const active = conversations.find((c) => c.id === activeId) ?? conversations[0] ?? null;

  const messagesKey = ['organizations', orgId, 'conversations', active?.id, 'messages'];
  const messagesQuery = useQuery({
    queryKey: messagesKey,
    queryFn: () => api.listMessages(orgId, active.id),
    enabled: Boolean(active?.id),
  });
  const messages = messagesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => api.createConversation(orgId, { repositoryId: repoId }),
    onSuccess: (conversation) => {
      setActiveId(conversation.id);
      setError(null);
      queryClient.invalidateQueries({ queryKey: conversationsKey });
    },
    onError: (err) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (conversationId) => api.deleteConversation(orgId, conversationId),
    onSuccess: () => {
      setActiveId(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: conversationsKey });
    },
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messagesQuery.data, streaming, active?.id]);

  const streamingActive = Boolean(streaming);

  async function handleSend() {
    const content = input.trim();
    if (!content || !active) return;
    setInput('');
    setError(null);
    setStreaming({ draft: '', sources: [], error: null, done: false });
    let failed = false;
    try {
      await api.streamAssistantReply(orgId, active.id, content, (event) => {
        if (event.type === 'sources') {
          setStreaming((s) => ({ ...s, sources: event.sources ?? [] }));
        } else if (event.type === 'delta') {
          setStreaming((s) => ({ ...s, draft: s.draft + (event.text ?? '') }));
        } else if (event.type === 'error') {
          failed = true;
          setStreaming((s) => ({ ...s, error: event.message ?? 'The assistant failed to reply.' }));
        }
      });
    } catch (err) {
      failed = true;
      setStreaming((s) => ({ ...s, error: err.message }));
    } finally {
      if (!failed) {
        setStreaming(null);
      }
      queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.invalidateQueries({ queryKey: conversationsKey });
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">Engineering assistant</h2>
            <p className="mt-0.5 text-xs text-muted">
              Ask questions about this repository. Replies are grounded in the indexed files of
              this repo only.
            </p>
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={streamingActive || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            New conversation
          </button>
        </div>
        <ErrorBanner>{error}</ErrorBanner>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="max-h-96 space-y-1 overflow-y-auto lg:max-h-[28rem]">
          {conversationsQuery.isPending ? (
            <p className="text-xs text-muted">Loading conversations…</p>
          ) : conversationsQuery.isError ? (
            <ErrorBanner>{conversationsQuery.error.message}</ErrorBanner>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                  conversation.id === active?.id
                    ? 'border-accent bg-accent text-canvas'
                    : 'border-line text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => setActiveId(conversation.id)}
                >
                  {conversation.title}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${conversation.title}`}
                  disabled={streamingActive}
                  onClick={() => deleteMutation.mutate(conversation.id)}
                  className="text-current opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </nav>

        <div className="flex min-h-[24rem] flex-col rounded-lg border border-line bg-panel">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messagesQuery.isError ? (
              <ErrorBanner>{messagesQuery.error.message}</ErrorBanner>
            ) : messagesQuery.isPending && active ? (
              <p className="text-sm text-muted">Loading messages…</p>
            ) : messages.length === 0 && !streaming ? (
              <p className="text-sm text-muted">
                Ask the first question to start a conversation about this repository.
              </p>
            ) : (
              <>
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {streaming ? (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink">
                      {streaming.error ? (
                        <span className="text-red-400">{streaming.error}</span>
                      ) : (
                        <>
                          <div className="whitespace-pre-wrap">{streaming.draft}</div>
                          {!streaming.done && streaming.draft.length === 0 ? (
                            <span className="text-xs text-muted">Thinking…</span>
                          ) : null}
                          {streaming.sources.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {streaming.sources.map((source, index) => (
                                <SourceChip key={`${source.path}-${index}`} source={source} />
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2 border-t border-line p-3"
          >
            <input
              type="text"
              value={input}
              placeholder="Ask about this repository…"
              disabled={streamingActive || !active}
              onChange={(e) => setInput(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              className={buttonClass}
              disabled={streamingActive || !active || input.trim().length === 0}
            >
              {streamingActive ? 'Replying…' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
