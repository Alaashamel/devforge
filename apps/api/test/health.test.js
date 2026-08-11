import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/v1/health', () => {
  it('returns a liveness payload', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('devforge-api');
    expect(res.body.data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('aliases the /live probe', async () => {
    const res = await request(app).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('GET /api/v1/health/ready', () => {
  it('reports degraded with a down database in the test environment', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.checks.database).toBe('down');
  });
});
