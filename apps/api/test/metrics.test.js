import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

let app;

beforeEach(() => {
  app = createApp();
});

async function scrape() {
  const res = await request(app).get('/metrics');
  return { res, body: res.text };
}

describe('GET /metrics', () => {
  it('exposes a Prometheus text exposition payload', async () => {
    await request(app).get('/api/v1/health/live');
    const { res, body } = await scrape();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(body).toMatch(/# TYPE http_requests_total counter/);
    expect(body).toMatch(/# TYPE http_request_duration_seconds histogram/);
    expect(body).toMatch(/# TYPE process_uptime_seconds gauge/);
    expect(body).toMatch(/process_uptime_seconds \d/);
    expect(body).toMatch(/process_memory_rss_bytes \d+/);
  });

  it('records matched requests with their route pattern', async () => {
    await request(app).get('/api/v1/health/live');
    const { body } = await scrape();
    expect(body).toContain(
      'http_requests_total{method="GET",route="/api/v1/health/live",status="200"} 1',
    );
    expect(body).toMatch(
      /http_request_duration_seconds_count\{.*route="\/api\/v1\/health\/live".*\} 1/,
    );
  });

  it('records unmatched requests as unmatched with status 404', async () => {
    await request(app).get('/definitely-not-a-route');
    const { body } = await scrape();
    expect(body).toContain(
      'http_requests_total{method="GET",route="unmatched",status="404"} 1',
    );
  });

  it('produces cumulative histogram buckets ending in +Inf', async () => {
    await request(app).get('/api/v1/health');
    const { body } = await scrape();
    expect(body).toMatch(/# TYPE http_request_duration_seconds histogram/);
    const healthCountLine = body
      .split('\n')
      .find(
        (line) =>
          line.includes('http_request_duration_seconds_count') &&
          line.includes('/api/v1/health'),
      );
    expect(healthCountLine).toBeTruthy();
    expect(healthCountLine).toMatch(/ 1$/);
    expect(
      body
        .split('\n')
        .filter(
          (line) =>
            line.startsWith('http_request_duration_seconds_bucket') &&
            line.includes('le="+Inf"'),
        ),
    ).not.toHaveLength(0);
  });
});
