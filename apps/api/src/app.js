import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { requestId } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp() {
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

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
