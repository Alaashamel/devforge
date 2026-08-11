export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details, cause } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    if (cause) this.cause = cause;
    Error.captureStackTrace(this, AppError);
  }
}

export const badRequest = (message = 'Bad request', details) =>
  new AppError(message, { status: 400, code: 'BAD_REQUEST', details });

export const validationError = (details) =>
  new AppError('Validation failed', { status: 400, code: 'VALIDATION_ERROR', details });

export const unauthorized = (message = 'Authentication required', details) =>
  new AppError(message, { status: 401, code: 'UNAUTHORIZED', details });

export const forbidden = (message = 'Insufficient permissions', details) =>
  new AppError(message, { status: 403, code: 'FORBIDDEN', details });

export const notFound = (message = 'Resource not found', details) =>
  new AppError(message, { status: 404, code: 'NOT_FOUND', details });

export const conflict = (message = 'Resource conflict', details) =>
  new AppError(message, { status: 409, code: 'CONFLICT', details });

export const rateLimited = (message = 'Too many requests', details) =>
  new AppError(message, { status: 429, code: 'RATE_LIMITED', details });

export const serviceUnavailable = (message = 'Service unavailable', details) =>
  new AppError(message, { status: 503, code: 'SERVICE_UNAVAILABLE', details });

export const externalServiceError = (message = 'External service error', details, cause) =>
  new AppError(message, { status: 502, code: 'EXTERNAL_SERVICE_ERROR', details, cause });
