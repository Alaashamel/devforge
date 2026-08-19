/**
 * Express middleware that records a `http_requests_total` counter and a
 * `http_request_duration_seconds` histogram per (method, route, status).
 *
 * The route label is the matched pattern (e.g. `/api/v1/health/live` when the
 * handler ran). Requests rejected before a handler ran (401/403/404) fall
 * back to the mounted base path, or `unmatched`.
 */
export function createMetricsMiddleware(registry) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const matched = req.route?.path != null;
      const route = matched ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      registry.inc('http_requests_total', labels);
      registry.observe('http_request_duration_seconds', labels, seconds);
    });
    next();
  };
}
