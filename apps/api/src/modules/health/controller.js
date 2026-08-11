import { asyncHandler } from '../../utils/async-handler.js';
import * as service from './service.js';

export const liveness = asyncHandler(async (_req, res) => {
  res.json({ data: service.getLiveness() });
});

export const readiness = asyncHandler(async (_req, res) => {
  const result = await service.getReadiness();
  const status = result.status === 'ok' ? 200 : 503;
  res.status(status).json({ data: result });
});
