export function StatusPill({ label, tone = 'neutral' }) {
  const dotClass = {
    good: 'bg-accent',
    danger: 'bg-red-400',
    warning: 'bg-amber-400',
    neutral: 'bg-muted',
  }[tone];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
