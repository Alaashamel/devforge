import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createAiController } from './controller.js';
import { createAnalysisSchema } from './schemas.js';

export function createAiRouter({ service, authorize }) {
  const controller = createAiController(service);
  const router = Router({ mergeParams: true });

  router.post(
    '/analyses',
    authorize('ai.run'),
    validate(createAnalysisSchema),
    asyncHandler(controller.createAnalysis),
  );
  router.get('/analyses', authorize('project.view'), asyncHandler(controller.listAnalyses));
  router.get('/jobs/:jobId', authorize('project.view'), asyncHandler(controller.getJobStatus));

  return router;
}

export function createAiArchiveRouter({ service }) {
  const controller = createAiController(service);
  const router = Router();
  router.get('/:repoId', asyncHandler(controller.streamArchive));
  return router;
}
