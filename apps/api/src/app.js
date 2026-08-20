import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './database/pool.js';
import { requestId } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { asyncHandler } from './utils/async-handler.js';
import { healthRouter } from './modules/health/routes.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createAuthService } from './modules/auth/service.js';
import { createAuthMiddleware } from './modules/auth/middleware.js';
import { createAccessTokenService } from './modules/auth/tokens.js';
import { createPasswordService } from './modules/auth/password.js';
import { createMailer } from './modules/auth/mailer.js';
import { createRateLimiter, AUTH_RATE_LIMITS } from './middleware/rate-limit.js';
import { createOrganizationService } from './modules/organizations/service.js';
import { createOrganizationRouter } from './modules/organizations/routes.js';
import { createProjectService } from './modules/projects/service.js';
import { createProjectRouter } from './modules/projects/routes.js';
import { createMilestoneService } from './modules/milestones/service.js';
import { createMilestoneRouter } from './modules/milestones/routes.js';
import { createLabelService } from './modules/labels/service.js';
import { createLabelRouter } from './modules/labels/routes.js';
import { createTaskService } from './modules/tasks/service.js';
import { createTaskRouter } from './modules/tasks/routes.js';
import { createGithubService } from './modules/github/service.js';
import { createGithubClient } from './modules/github/client.js';
import { createGithubCrypto } from './modules/github/crypto.js';
import { createGithubController } from './modules/github/controller.js';
import { createGithubRouter, createRepositoryRouter } from './modules/github/routes.js';
import { createAnalyticsService } from './modules/analytics/service.js';
import { createAnalyticsRouter } from './modules/analytics/routes.js';
import { createRealtimeHub } from './modules/realtime/index.js';
import { createNotificationService } from './modules/notifications/service.js';
import { createNotificationRouter } from './modules/notifications/routes.js';
import { createActivityService } from './modules/activity/service.js';
import { createActivityRouter } from './modules/activity/routes.js';
import { createChatService } from './modules/chat/service.js';
import { createChatRouter } from './modules/chat/routes.js';
import { createAiService } from './modules/ai/service.js';
import { createAiRouter, createAiArchiveRouter } from './modules/ai/routes.js';
import { createMetricsRegistry } from './modules/metrics/registry.js';
import { createMetricsMiddleware } from './modules/metrics/middleware.js';
import { createMetricsRouter } from './modules/metrics/routes.js';

function buildDefaultAuth() {
  const accessTokens = createAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    ttl: env.JWT_ACCESS_TTL,
  });
  const service = createAuthService({
    pool,
    password: createPasswordService({
      memoryCost: env.ARGON2_MEMORY_COST,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    }),
    accessTokens,
    mailer: createMailer({ logger, isProduction: env.isProduction, webBaseUrl: env.WEB_BASE_URL }),
    refreshTtlDays: env.REFRESH_TTL_DAYS,
  });
  const middleware = createAuthMiddleware({
    accessTokens,
    resolveRole: service.resolveEffectiveRole,
  });
  const limiter = createRateLimiter({ limits: AUTH_RATE_LIMITS });
  return { service, middleware, limiter, accessTokens };
}

export function buildDefaultModules({
  pool: dbPool = pool,
  resolveRole,
  github = null,
  analytics = null,
  realtime = null,
  ai = null,
} = {}) {
  const notifications = createNotificationService({ pool: dbPool, realtime });
  const activity = createActivityService({ pool: dbPool, realtime });
  const githubService =
    github ??
    createGithubService({
      pool: dbPool,
      client: createGithubClient({ apiUrl: env.GITHUB_API_URL, userAgent: env.GITHUB_APP_NAME }),
      crypto: createGithubCrypto({ key: env.GITHUB_ENCRYPTION_KEY }),
      oauth: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        authorizeUrl: env.GITHUB_OAUTH_URL,
        callbackUrl: env.GITHUB_OAUTH_CALLBACK_URL,
        scope: 'repo read:org',
      },
      webBaseUrl: env.WEB_BASE_URL,
      apiBaseUrl: env.API_BASE_URL,
    });
  return {
    organizations: createOrganizationService({ pool: dbPool }),
    projects: createProjectService({ pool: dbPool }),
    milestones: createMilestoneService({ pool: dbPool }),
    labels: createLabelService({ pool: dbPool }),
    tasks: createTaskService({ pool: dbPool, resolveRole, realtime, notifications, activity }),
    notifications,
    activity,
    chat: createChatService({ pool: dbPool, realtime }),
    github: githubService,
    ai:
      ai ??
      createAiService({
        pool: dbPool,
        github: githubService,
        aiServiceUrl: env.AI_SERVICE_URL,
        jobSecret: env.AI_JOB_SECRET,
        jobTokenTtlSeconds: env.AI_JOB_TTL_SECONDS,
        archiveTokenTtlSeconds: env.AI_ARCHIVE_TTL_SECONDS,
        apiBaseUrl: env.API_BASE_URL,
      }),
    analytics: analytics ?? createAnalyticsService({ pool: dbPool }),
  };
}

export function createApp({ auth = null, modules = null, realtime = null, metrics = null } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));

  app.use(requestId());
  app.use(requestLogger());

  const metricsRegistry = metrics?.registry ?? createMetricsRegistry();
  app.use(metrics?.middleware ?? createMetricsMiddleware(metricsRegistry));
  app.locals.metrics = metricsRegistry;

  app.get('/', (_req, res) => {
    res.json({
      service: 'devforge-api',
      version: '1.0.0',
      health: '/api/v1/health',
    });
  });

  const authBundle = auth ?? buildDefaultAuth();
  const hub =
    realtime ??
    createRealtimeHub({
      pool,
      accessTokens: authBundle.accessTokens,
      resolveRole: authBundle.service.resolveEffectiveRole,
    });
  const moduleBundle =
    modules ??
    buildDefaultModules({
      pool,
      resolveRole: authBundle.service.resolveEffectiveRole,
      realtime: hub,
    });
  app.locals.realtime = hub;

  // Webhook delivery is signed, so it must read the raw body. Register before
  // the JSON parser so express.json never runs on this route.
  app.post(
    '/api/v1/webhooks/github/:repoId',
    express.raw({
      type: 'application/json',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
    asyncHandler(createGithubController(moduleBundle.github).handleWebhook),
  );

  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', healthRouter);
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      service: authBundle.service,
      requireAuth: authBundle.middleware.requireAuth,
      limiter: authBundle.limiter,
    }),
  );
  app.use(
    '/api/v1/organizations',
    createOrganizationRouter({
      service: moduleBundle.organizations,
      requireAuth: authBundle.middleware.requireAuth,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/projects',
    authBundle.middleware.requireAuth,
    createProjectRouter({
      service: moduleBundle.projects,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/projects/:projectId/milestones',
    authBundle.middleware.requireAuth,
    createMilestoneRouter({
      service: moduleBundle.milestones,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/projects/:projectId/labels',
    authBundle.middleware.requireAuth,
    createLabelRouter({
      service: moduleBundle.labels,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/projects/:projectId/tasks',
    authBundle.middleware.requireAuth,
    createTaskRouter({
      service: moduleBundle.tasks,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/github',
    createGithubRouter({
      service: moduleBundle.github,
      requireAuth: authBundle.middleware.requireAuth,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/repositories',
    authBundle.middleware.requireAuth,
    createRepositoryRouter({
      service: moduleBundle.github,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/analytics',
    authBundle.middleware.requireAuth,
    createAnalyticsRouter({
      service: moduleBundle.analytics,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/notifications',
    createNotificationRouter({
      service: moduleBundle.notifications,
      requireAuth: authBundle.middleware.requireAuth,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/activity',
    authBundle.middleware.requireAuth,
    createActivityRouter({
      service: moduleBundle.activity,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/chat',
    authBundle.middleware.requireAuth,
    createChatRouter({
      service: moduleBundle.chat,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use(
    '/api/v1/organizations/:orgId/ai',
    authBundle.middleware.requireAuth,
    createAiRouter({
      service: moduleBundle.ai,
      authorize: authBundle.middleware.authorize,
    }),
  );
  app.use('/api/v1/ai/archive', createAiArchiveRouter({ service: moduleBundle.ai }));
  app.use('/metrics', createMetricsRouter({ registry: metricsRegistry }));

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
