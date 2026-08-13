import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { getSocket, onRealtime, emitEvent } from '../services/socket.js';
import { useRealtime } from '../hooks/use-realtime.js';

const TYPING_EMIT_MS = 2000;
const TYPING_VISIBLE_MS = 3000;

function sameUser(a, b) {
  return a && b && a.id === b.id;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Chat() {
  const orgId = useWorkspaceStore((s) => s.orgId);
  const status = useAuthStore((s) => s.status);
  const me = useAuthStore((s) => s.user);

  const [draft, setDraft] = useState('');
  const [live, setLive] = useState([]);
  const [typing, setTyping] = useState({});
  const [online, setOnline] = useState({});
  const liveIds = useRef(new Set());
  const lastTypingEmit = useRef(0);
  const typingTimers = useRef(new Map());
  const endRef = useRef(null);

  const messagesQuery = useQuery({
    queryKey: ['organizations', orgId, 'chat'],
    queryFn: () => api.listChatMessages(orgId),
    enabled: Boolean(orgId),
  });

  const membersQuery = useQuery({
    queryKey: ['organizations', orgId, 'members'],
    queryFn: () => api.listOrganizationMembers(orgId),
    enabled: Boolean(orgId),
  });

  function addMessages(messages) {
    const fresh = messages.filter((m) => {
      if (liveIds.current.has(m.id)) return false;
      liveIds.current.add(m.id);
      return true;
    });
    if (fresh.length === 0) return;
    setLive((prev) => [...prev, ...fresh]);
  }

  function showTyping(userId) {
    const existing = typingTimers.current.get(userId);
    if (existing) clearTimeout(existing);
    setTyping((prev) => ({ ...prev, [userId]: true }));
    const timer = setTimeout(() => {
      typingTimers.current.delete(userId);
      setTyping((prev) => ({ ...prev, [userId]: false }));
    }, TYPING_VISIBLE_MS);
    typingTimers.current.set(userId, timer);
  }

  useRealtime({
    rooms: orgId ? [`chat:${orgId}`, `org:${orgId}`] : [],
    on: {
      'chat:message': ({ message }) => addMessages([message]),
      'chat:typing': ({ userId }) => {
        if (userId !== me?.id) showTyping(userId);
      },
    },
  });

  useEffect(() => {
    if (!orgId || status !== 'authenticated') return undefined;
    const socket = getSocket();
    const off = onRealtime('presence:update', ({ userId, status: s }) => {
      setOnline((prev) => {
        const next = { ...prev };
        if (s === 'offline') delete next[userId];
        else next[userId] = s;
        return next;
      });
    });
    const joinPresence = async () => {
      const result = await new Promise((resolve) => {
        socket.timeout(3000).emit('presence:join', { orgId }, (err, res) =>
          resolve(err ? null : res),
        );
      });
      if (result?.ok) {
        const map = {};
        for (const entry of result.online) {
          if (entry.userId !== me?.id) map[entry.userId] = entry.status;
        }
        setOnline((prev) => ({ ...prev, ...map }));
      }
    };
    socket.on('connect', joinPresence);
    if (socket.connected) joinPresence();
    return () => {
      socket.off('connect', joinPresence);
      off();
    };
  }, [orgId, status, me?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [live, messagesQuery.data]);

  const members = membersQuery.data ?? [];
  const memberNames = new Map(members.map((m) => [m.id, m.name]));
  const typingNames = Object.entries(typing)
    .filter(([, active]) => active)
    .map(([userId]) => memberNames.get(userId) ?? 'Someone');

  const history = messagesQuery.data ?? [];
  const messages = [...history, ...live].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );

  async function sendMessage(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !orgId) return;
    setDraft('');
    try {
      const { data } = await api.sendChatMessage(orgId, { body });
      addMessages([data]);
    } catch {
      setDraft(body);
    }
  }

  function onDraftChange(value) {
    setDraft(value);
    if (!orgId) return;
    const now = Date.now();
    if (now - lastTypingEmit.current > TYPING_EMIT_MS) {
      lastTypingEmit.current = now;
      emitEvent('chat:typing', { orgId });
    }
  }

  const onlineCount = Object.keys(online).length + (me ? 1 : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Team chat</h1>
        <p className="mt-1 text-sm text-muted">
          Live conversation with the rest of the workspace.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="flex flex-col rounded-lg border border-line bg-panel">
          <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: '60vh' }}>
            {messagesQuery.isPending && live.length === 0 ? (
              <p className="text-sm text-muted">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted">
                No messages yet. Say hello to the team.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${sameUser(message.author, me) ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      sameUser(message.author, me)
                        ? 'bg-accent/10 text-ink'
                        : 'bg-line/40 text-ink'
                    }`}
                  >
                    {!sameUser(message.author, me) ? (
                      <div className="mb-1 text-[11px] font-medium text-muted">
                        {message.author?.name ?? 'Unknown'}
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                    <div className="mt-1 text-right text-[10px] text-muted">
                      {formatTime(message.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
            {typingNames.length > 0 ? (
              <p className="text-xs italic text-muted">
                {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing…
              </p>
            ) : null}
            <div ref={endRef} />
          </div>

          <form onSubmit={sendMessage} className="flex gap-2 border-t border-line p-3">
            <input
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="Type a message…"
              aria-label="Message"
              className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || !orgId}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Online
          </div>
          <p className="mt-1 text-xs text-muted">{onlineCount} online</p>
          <div className="mt-3 space-y-2">
            {members.map((member) => {
              const isOnline = member.id === me?.id || online[member.id] === 'online';
              return (
                <div key={member.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isOnline ? 'bg-emerald-400' : 'bg-line'
                    }`}
                    aria-label={isOnline ? 'Online' : 'Offline'}
                  />
                  <span className="text-ink">{member.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
