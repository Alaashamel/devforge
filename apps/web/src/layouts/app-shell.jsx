import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useUiStore } from '../stores/ui.js';
import { useAuthStore } from '../stores/auth.js';

const primaryNav = [{ to: '/', label: 'Dashboard', end: true }];

const upcomingNav = [
  { label: 'Projects', phase: 'Phase 4' },
  { label: 'Repositories', phase: 'Phase 5' },
  { label: 'Analytics', phase: 'Phase 6' },
  { label: 'AI', phase: 'Phase 8–9' },
  { label: 'Docs', phase: 'Phase 12' },
];

export function AppShell() {
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
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
        <header className="flex h-14 items-center justify-between border-b border-line px-6">
          <span className="font-mono text-xs text-muted">~/workspace</span>
          <div className="flex items-center gap-3">
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
