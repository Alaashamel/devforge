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
  return { service, middleware, limiter };
}

export function buildDefaultModules({ pool: dbPool = pool, resolveRole }) {
  return {
    organizations: createOrganizationService({ pool: dbPool }),
    projects: createProjectService({ pool: dbPool }),
    milestones: createMilestoneService({ pool: dbPool }),
    labels: createLabelService({ pool: dbPool }),
    tasks: createTaskService({ pool: dbPool, resolveRole }),
  };
}

export function createApp({ auth = null, modules = null } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use(requestId());
  app.use(requestLogger());

  app.get('/', (_req, res) => {
    res.json({
      service: 'devforge-api',
      version: '0.1.0',
      health: '/api/v1/health',
    });
  });

  const authBundle = auth ?? buildDefaultAuth();
  const moduleBundle = modules ?? buildDefaultModules({ pool, resolveRole: authBundle.service.resolveEffectiveRole });

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

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
