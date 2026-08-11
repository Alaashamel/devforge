import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger.js';

export function requestId() {
  return (req, res, next) => {
    req.id = req.get('X-Request-Id') || randomUUID();
    req.log = logger.child({ requestId: req.id });
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}
