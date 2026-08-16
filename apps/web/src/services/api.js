const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

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

  listOrganizations: () => request('/organizations'),

  getGithubConnection: () => request('/github/connection'),
  beginGithubOAuth: () => request('/github/oauth/begin', { method: 'POST' }),
  disconnectGithub: () =>
    request('/github/disconnect', { method: 'POST', acceptStatus: [204] }),

  listRepositories: (orgId) => request(`/organizations/${orgId}/repositories`),
  importRepository: (orgId, payload) =>
    request(`/organizations/${orgId}/repositories/import`, { method: 'POST', body: payload }),
  getRepository: (orgId, repoId) => request(`/organizations/${orgId}/repositories/${repoId}`),
  syncRepository: (orgId, repoId) =>
    request(`/organizations/${orgId}/repositories/${repoId}/sync`, { method: 'POST' }),
  deleteRepository: (orgId, repoId) =>
    request(`/organizations/${orgId}/repositories/${repoId}`, {
      method: 'DELETE',
      acceptStatus: [204],
    }),

  listPullRequests: (orgId, repoId, params = {}) =>
    request(`/organizations/${orgId}/repositories/${repoId}/pull-requests${toQuery(params)}`),
  listBranches: (orgId, repoId) =>
    request(`/organizations/${orgId}/repositories/${repoId}/branches`),
  listCommits: (orgId, repoId, params = {}) =>
    request(`/organizations/${orgId}/repositories/${repoId}/commits${toQuery(params)}`),
  listIssues: (orgId, repoId, params = {}) =>
    request(`/organizations/${orgId}/repositories/${repoId}/issues${toQuery(params)}`),

  listWebhooks: (orgId, repoId) =>
    request(`/organizations/${orgId}/repositories/${repoId}/webhooks`),
  createWebhook: (orgId, repoId, payload) =>
    request(`/organizations/${orgId}/repositories/${repoId}/webhooks`, {
      method: 'POST',
      body: payload,
    }),
  deleteWebhook: (orgId, repoId, webhookId) =>
    request(`/organizations/${orgId}/repositories/${repoId}/webhooks/${webhookId}`, {
      method: 'DELETE',
      acceptStatus: [204],
    }),

  createAnalysis: (orgId, payload) =>
    request(`/organizations/${orgId}/ai/analyses`, { method: 'POST', body: payload }),
  listAnalyses: (orgId, params = {}) =>
    request(`/organizations/${orgId}/ai/analyses${toQuery(params)}`),
  getAnalysis: (orgId, analysisId) =>
    request(`/organizations/${orgId}/ai/analyses/${analysisId}`),
  approveAnalysis: (orgId, analysisId, payload) =>
    request(`/organizations/${orgId}/ai/analyses/${analysisId}/approve`, {
      method: 'POST',
      body: payload,
    }),
  getAiJobStatus: (orgId, jobId) =>
    request(`/organizations/${orgId}/ai/jobs/${jobId}`),

  listProjects: (orgId, params = {}) => request(`/organizations/${orgId}/projects${toQuery(params)}`),
  getProject: (orgId, projectId) => request(`/organizations/${orgId}/projects/${projectId}`),
  createProject: (orgId, payload) =>
    request(`/organizations/${orgId}/projects`, { method: 'POST', body: payload }),
  updateProject: (orgId, projectId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}`, { method: 'PATCH', body: payload }),
  deleteProject: (orgId, projectId) =>
    request(`/organizations/${orgId}/projects/${projectId}`, { method: 'DELETE', acceptStatus: [204] }),
  listProjectMembers: (orgId, projectId) =>
    request(`/organizations/${orgId}/projects/${projectId}/members`),
  setProjectMember: (orgId, projectId, userId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/members/${userId}`, {
      method: 'PUT',
      body: payload,
    }),
  removeProjectMember: (orgId, projectId, userId) =>
    request(`/organizations/${orgId}/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
      acceptStatus: [204],
    }),

  listMilestones: (orgId, projectId) =>
    request(`/organizations/${orgId}/projects/${projectId}/milestones`),
  createMilestone: (orgId, projectId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/milestones`, {
      method: 'POST',
      body: payload,
    }),
  updateMilestone: (orgId, projectId, milestoneId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'PATCH',
      body: payload,
    }),
  deleteMilestone: (orgId, projectId, milestoneId) =>
    request(`/organizations/${orgId}/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'DELETE',
      acceptStatus: [204],
    }),

  listLabels: (orgId, projectId) =>
    request(`/organizations/${orgId}/projects/${projectId}/labels`),
  createLabel: (orgId, projectId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/labels`, {
      method: 'POST',
      body: payload,
    }),
  updateLabel: (orgId, projectId, labelId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/labels/${labelId}`, {
      method: 'PATCH',
      body: payload,
    }),
  deleteLabel: (orgId, projectId, labelId) =>
    request(`/organizations/${orgId}/projects/${projectId}/labels/${labelId}`, {
      method: 'DELETE',
      acceptStatus: [204],
    }),

  listTasks: (orgId, projectId, params = {}) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks${toQuery(params)}`),
  getTask: (orgId, projectId, taskId) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`),
  createTask: (orgId, projectId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks`, {
      method: 'POST',
      body: payload,
    }),
  updateTask: (orgId, projectId, taskId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: payload,
    }),
  deleteTask: (orgId, projectId, taskId) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
      acceptStatus: [204],
    }),

  listTaskComments: (orgId, projectId, taskId) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`),
  addTaskComment: (orgId, projectId, taskId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: payload,
    }),
  updateTaskComment: (orgId, projectId, taskId, commentId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, {
      method: 'PATCH',
      body: payload,
    }),
  deleteTaskComment: (orgId, projectId, taskId, commentId) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, {
      method: 'DELETE',
      acceptStatus: [204],
    }),

  setTaskLabels: (orgId, projectId, taskId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/labels`, {
      method: 'PUT',
      body: payload,
    }),
  listTaskActivity: (orgId, projectId, taskId) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/activity`),
  listDependencies: (orgId, projectId, taskId) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/dependencies`),
  addDependency: (orgId, projectId, taskId, payload) =>
    request(`/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: payload,
    }),
  removeDependency: (orgId, projectId, taskId, dependsOnId) =>
    request(
      `/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/dependencies/${dependsOnId}`,
      { method: 'DELETE', acceptStatus: [204] },
    ),

  getAnalyticsOverview: (orgId) =>
    request(`/organizations/${orgId}/analytics/overview`),
  getAnalyticsVelocity: (orgId, params = {}) =>
    request(`/organizations/${orgId}/analytics/velocity${toQuery(params)}`),
  getAnalyticsHealth: (orgId) =>
    request(`/organizations/${orgId}/analytics/health`),
  getAnalyticsDevelopers: (orgId, params = {}) =>
    request(`/organizations/${orgId}/analytics/developers${toQuery(params)}`),
  listRepositoryAnalytics: (orgId) =>
    request(`/organizations/${orgId}/analytics/repositories`),
  getRepositoryAnalytics: (orgId, repoId) =>
    request(`/organizations/${orgId}/analytics/repositories/${repoId}/activity`),

  listOrganizationMembers: (orgId) => request(`/organizations/${orgId}/members`),

  listNotifications: (params = {}) =>
    request(`/notifications${toQuery(params)}`),
  getNotificationUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),

  listOrganizationActivity: (orgId, params = {}) =>
    request(`/organizations/${orgId}/activity${toQuery(params)}`),

  listChatMessages: (orgId, params = {}) =>
    request(`/organizations/${orgId}/chat/messages${toQuery(params)}`),
  sendChatMessage: (orgId, payload) =>
    request(`/organizations/${orgId}/chat/messages`, { method: 'POST', body: payload }),
};
