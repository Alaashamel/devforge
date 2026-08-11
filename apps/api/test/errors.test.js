import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AppError, notFound, unauthorized, validationError } from '../src/utils/errors.js';

const app = createApp();

describe('error envelope', () => {
  it('returns a 404 envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('not found');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('sets the X-Request-Id response header', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('propagates an inbound X-Request-Id', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'trace-abc-123');
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });
});

describe('AppError domain errors', () => {
  it('is an Error subclass carrying status and code', () => {
    const err = notFound('nope');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('nope');
  });

  it('applies defaults for generic errors', () => {
    const err = new AppError('boom');
    expect(err.status).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('carries structured details for validation errors', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const err = validationError(details);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });

  it('exposes unauthorized errors', () => {
    const err = unauthorized('Login required');
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});
