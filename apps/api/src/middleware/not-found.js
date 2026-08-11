import { notFound } from '../utils/errors.js';

export function notFoundHandler() {
  return (req, _res, next) => {
    next(notFound(`Route ${req.method} ${req.originalUrl} not found`));
  };
}
