import { rateLimited } from '../utils/errors.js';

class MemorySlidingWindow {
  constructor() {
    this.hits = new Map();
  }

  check(key, now, { windowMs, max }) {
    const windowStart = now - windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((at) => at > windowStart);

    if (timestamps.length >= max) {
      this.hits.set(key, timestamps);
      const retryAfterMs = windowMs - (now - timestamps[0]);
      return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, remaining: max - timestamps.length, retryAfter: 0 };
  }

  reset() {
    this.hits.clear();
  }
}

export function createRateLimiter({ limits, store = new MemorySlidingWindow() }) {
  const middleware = (name) => {
    const config = limits[name];
    if (!config) {
      throw new Error(`unknown rate limit bucket: ${name}`);
    }
    return (req, res, next) => {
      const result = store.check(`${name}:${req.ip}`, Date.now(), config);
      res.set('X-RateLimit-Limit', String(config.max));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      if (!result.allowed) {
        res.set('Retry-After', String(result.retryAfter));
        return next(rateLimited('Too many requests, slow down'));
      }
      return next();
    };
  };
  middleware.reset = () => store.reset();
  return middleware;
}

export const AUTH_RATE_LIMITS = {
  register: { windowMs: 15 * 60 * 1000, max: 10 },
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  refresh: { windowMs: 15 * 60 * 1000, max: 60 },
  logout: { windowMs: 15 * 60 * 1000, max: 60 },
  'verify-email': { windowMs: 15 * 60 * 1000, max: 20 },
  'forgot-password': { windowMs: 15 * 60 * 1000, max: 5 },
  'reset-password': { windowMs: 15 * 60 * 1000, max: 10 },
};
