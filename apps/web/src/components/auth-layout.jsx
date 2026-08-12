export const inputClass =
  'w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export const buttonClass =
  'w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="font-mono text-lg font-semibold tracking-tight text-accent">
            DEVFORGE
          </span>
          <h1 className="mt-3 text-lg font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="rounded-lg border border-line bg-panel p-6">{children}</div>
      </div>
    </div>
  );
}

export function FormBanner({ tone = 'info', children }) {
  const tones = {
    info: 'border-accent/40 text-ink',
    success: 'border-emerald-500/40 text-emerald-400',
    error: 'border-red-500/40 text-red-400',
  };
  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${tones[tone] ?? tones.info}`}>
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
