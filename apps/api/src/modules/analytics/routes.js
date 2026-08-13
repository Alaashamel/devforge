import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { createAnalyticsController } from './controller.js';

export function createAnalyticsRouter({ service, authorize }) {
  const controller = createAnalyticsController(service);
  const router = Router({ mergeParams: true });

  router.get('/overview', authorize('project.view'), asyncHandler(controller.getOverview));
  router.get('/velocity', authorize('project.view'), asyncHandler(controller.getVelocity));
  router.get('/health', authorize('project.view'), asyncHandler(controller.getHealth));
  router.get('/developers', authorize('project.view'), asyncHandler(controller.getDevelopers));
  router.get(
    '/repositories',
    authorize('project.view'),
    asyncHandler(controller.listRepositorySummaries),
  );
  router.get(
    '/repositories/:repoId/activity',
    authorize('project.view'),
    asyncHandler(controller.getRepositoryActivity),
  );

  return router;
}
