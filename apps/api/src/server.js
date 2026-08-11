import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();
const server = createServer(app);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    logger.info('server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(env.PORT, env.HOST, () => {
  logger.info(
    { host: env.HOST, port: env.PORT, env: env.NODE_ENV },
    'devforge-api listening',
  );
});
