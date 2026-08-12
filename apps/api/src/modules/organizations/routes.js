import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { createOrganizationController } from './controller.js';

export function createOrganizationRouter({ service, requireAuth }) {
  const controller = createOrganizationController(service);
  const router = Router();

  router.get('/', requireAuth, asyncHandler(controller.listMy));

  return router;
}
