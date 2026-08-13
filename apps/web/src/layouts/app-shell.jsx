import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useUiStore } from '../stores/ui.js';
import { useAuthStore } from '../stores/auth.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { useNotificationsStore } from '../stores/notifications.js';
import { connectSocket, disconnectSocket, onRealtime } from '../services/socket.js';

const primaryNav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/repositories', label: 'Repositories' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/chat', label: 'Chat' },
];

const upcomingNav = [
  { label: 'AI', phase: 'Phase 8–9' },
  { label: 'Docs', phase: 'Phase 12' },
];

function formatRelative(iso) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function AppShell() {
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const orgId = useWorkspaceStore((s) => s.orgId);
  const selectOrg = useWorkspaceStore((s) => s.selectOrg);
  const notifications = useNotificationsStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const orgsQuery = useQuery({ queryKey: ['organizations'], queryFn: api.listOrganizations });

  useEffect(() => {
    if (!orgId && orgsQuery.data?.length > 0) {
      selectOrg(orgsQuery.data[0].id);
    }
  }, [orgId, orgsQuery.data, selectOrg]);

  useEffect(() => {
    if (status !== 'authenticated') {
      disconnectSocket();
      return undefined;
    }
    connectSocket();
    const off = onRealtime('notification:new', (payload) => {
      if (payload?.notification) {
        useNotificationsStore.getState().handleNew(payload.notification);
      }
    });
    return off;
  }, [status]);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onMouseDown = (event) => {
      if (!event.target.closest('[data-notifications]')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [dropdownOpen]);

  async function onLogout() {
    disconnectSocket();
    await logout();
    navigate('/login', { replace: true });
  }

  function toggleNotifications() {
    const next = !dropdownOpen;
    setDropdownOpen(next);
    if (next) {
      notifications.refresh();
    }
  }

  function onNotificationClick(notification) {
    if (!notification.readAt) {
      notifications.markRead(notification.id);
    }
    setDropdownOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="font-mono text-sm font-semibold tracking-tight text-accent">
            DEVFORGE
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {primaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center rounded-md px-3 py-2 text-sm ${
                  isActive ? 'bg-line/60 text-ink' : 'text-muted hover:bg-panel hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <div className="pt-4 text-[11px] font-medium uppercase tracking-wider text-muted">
            Modules
          </div>
          {upcomingNav.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted"
            >
              <span>{item.label}</span>
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
                {item.phase}
              </span>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3 text-[11px] text-muted">
          DevForge v0.1.0
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-line px-6">
          <span className="font-mono text-xs text-muted">~/workspace</span>
          <div className="flex items-center gap-3">
            {orgsQuery.data?.length > 0 ? (
              <select
                value={orgId ?? ''}
                onChange={(e) => selectOrg(e.target.value)}
                className="rounded-md border border-line bg-canvas px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                aria-label="Organization"
              >
                {orgsQuery.data.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="relative" data-notifications>
              <button
                type="button"
                onClick={toggleNotifications}
                aria-label="Notifications"
                className="relative rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel hover:text-ink"
              >
                Notifications
                {notifications.unread > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {notifications.unread}
                  </span>
                ) : null}
              </button>

              {dropdownOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-lg border border-line bg-panel shadow-lg">
                  <div className="flex items-center justify-between border-b border-line px-3 py-2">
                    <span className="text-xs font-semibold">Notifications</span>
                    {notifications.unread > 0 ? (
                      <button
                        type="button"
                        onClick={() => notifications.markAllRead()}
                        className="text-[11px] text-muted hover:text-ink"
                      >
                        Mark all read
                      </button>
                    ) : null}
                  </div>
                  <div className="max-h-80 overflow-y-auto p-1">
                    {notifications.loading && notifications.items.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-muted">Loading…</p>
                    ) : notifications.items.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-muted">
                        No notifications yet
                      </p>
                    ) : (
                      notifications.items.map((notification) => (
                        <Link
                          key={notification.id}
                          to={notification.href ?? '/projects'}
                          onClick={() => onNotificationClick(notification)}
                          className={`block rounded-md px-3 py-2 hover:bg-line/40 ${
                            notification.readAt ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="text-xs font-medium">{notification.title}</div>
                          {notification.body ? (
                            <div className="mt-0.5 text-[11px] text-muted">
                              {notification.body}
                            </div>
                          ) : null}
                          <div className="mt-0.5 text-[10px] text-muted">
                            {formatRelative(notification.createdAt)}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            {user ? <span className="text-xs text-muted">{user.name}</span> : null}
            {user ? (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel hover:text-ink"
              >
                Sign out
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel hover:text-ink"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
