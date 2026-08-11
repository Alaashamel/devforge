export function StatCard({ label, value, tone = 'neutral', mono = false }) {
  const toneClass = {
    good: 'text-accent',
    danger: 'text-red-400',
    neutral: 'text-ink',
  }[tone];

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${mono ? 'font-mono' : ''} ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
