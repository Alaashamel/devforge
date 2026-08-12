import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimiter } from '../src/middleware/rate-limit.js';
import { errorHandler } from '../src/middleware/error-handler.js';

function buildApp(limits) {
  const limiter = createRateLimiter({ limits });
  const app = express();
  app.set('trust proxy', 1);
  app.get('/ping', limiter('ping'), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler());
  return { app, limiter };
}

describe('rate limiter', () => {
  it('allows up to the max then returns 429 with Retry-After', async () => {
    const { app } = buildApp({ ping: { windowMs: 60_000, max: 2 } });
    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(200);

    const res = await request(app).get('/ping');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeTruthy();
    expect(res.headers['x-ratelimit-limit']).toBe('2');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('buckets attempts by IP', async () => {
    const { app } = buildApp({ ping: { windowMs: 60_000, max: 1 } });
    expect((await request(app).get('/ping')).status).toBe(200);
    const other = await request(app).get('/ping').set('X-Forwarded-For', '1.2.3.4');
    expect(other.status).toBe(200);
  });

  it('reset() clears the sliding window', async () => {
    const { app, limiter } = buildApp({ ping: { windowMs: 60_000, max: 1 } });
    await request(app).get('/ping');
    expect((await request(app).get('/ping')).status).toBe(429);
    limiter.reset();
    expect((await request(app).get('/ping')).status).toBe(200);
  });

  it('throws for an unknown bucket', () => {
    const { limiter } = buildApp({ ping: { windowMs: 60_000, max: 1 } });
    expect(() => limiter('nope')).toThrow('unknown rate limit bucket: nope');
  });
});
