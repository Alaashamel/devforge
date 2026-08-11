const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

export class ApiError extends Error {
  constructor(message, { status, code, details, requestId } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

async function request(path, { acceptStatus = [] } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok && !acceptStatus.includes(response.status)) {
    throw new ApiError(payload?.error?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: payload?.error?.code,
      details: payload?.error?.details,
      requestId: payload?.error?.requestId,
    });
  }

  return payload?.data;
}

export const api = {
  getHealth: () => request('/health'),
  getReady: () => request('/ready', { acceptStatus: [503] }),
};
