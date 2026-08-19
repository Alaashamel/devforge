import { Router } from 'express';

/**
 * `GET /metrics` — Prometheus text exposition endpoint (no auth; ops probe).
 * Refreshes process gauges on every scrape so numbers are always current.
 */
export function createMetricsRouter({ registry }) {
  const router = Router();

  router.get('/', (_req, res) => {
    const memory = process.memoryUsage();
    registry.setGauge('process_uptime_seconds', {}, process.uptime());
    registry.setGauge('process_memory_rss_bytes', {}, memory.rss);
    registry.setGauge('process_memory_heap_used_bytes', {}, memory.heapUsed);
    registry.setGauge('process_memory_heap_total_bytes', {}, memory.heapTotal);

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(registry.render());
  });

  return router;
}
