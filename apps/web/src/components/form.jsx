export const inputClass =
  'w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export const buttonClass =
  'rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

export const ghostButtonClass =
  'rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel hover:text-ink';

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-400">
      {children}
    </div>
  );
}
