export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <h1 className="font-mono text-lg text-muted">404 — page not found</h1>
      <p className="text-sm text-muted">The route does not exist.</p>
    </div>
  );
}
