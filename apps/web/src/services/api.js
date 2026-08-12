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

let accessToken = null;
let refreshHandler = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function setRefreshHandler(handler) {
  refreshHandler = handler;
}

async function request(path, { method = 'GET', body, acceptStatus = [], authRetry = true, _retried = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (response.status === 401 && authRetry && !_retried && refreshHandler) {
    const refreshed = await refreshHandler();
    if (refreshed) {
      return request(path, { method, body, acceptStatus, authRetry, _retried: true });
    }
  }

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
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, authRetry: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, authRetry: false }),
  refresh: (payload) => request('/auth/refresh', { method: 'POST', body: payload, authRetry: false }),
  logout: (payload) =>
    request('/auth/logout', { method: 'POST', body: payload, authRetry: false, acceptStatus: [204] }),
  verifyEmail: (payload) =>
    request('/auth/verify-email', { method: 'POST', body: payload, authRetry: false }),
  forgotPassword: (payload) =>
    request('/auth/forgot-password', { method: 'POST', body: payload, authRetry: false }),
  resetPassword: (payload) =>
    request('/auth/reset-password', { method: 'POST', body: payload, authRetry: false }),
  me: () => request('/auth/me'),
};
