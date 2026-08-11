import { AppError } from '../utils/errors.js';

export function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    const log = req.log;

    if (err instanceof AppError) {
      const body = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
          requestId: req.id,
        },
      };
      if (err.status >= 500) log?.error({ err }, 'request failed');
      else log?.warn({ err }, 'request rejected');
      return res.status(err.status).json(body);
    }

    log?.error({ err }, 'unhandled error');
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: req.id },
    });
  };
}
