import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createMilestoneController } from './controller.js';
import { createMilestoneSchema, updateMilestoneSchema } from './schemas.js';

export function createMilestoneRouter({ service, authorize }) {
  const controller = createMilestoneController(service);
  const router = Router({ mergeParams: true });

  router.get('/', authorize('project.view'), asyncHandler(controller.list));
  router.post('/', authorize('projects.manage'), validate(createMilestoneSchema), asyncHandler(controller.create));
  router.patch('/:milestoneId', authorize('projects.manage'), validate(updateMilestoneSchema), asyncHandler(controller.update));
  router.delete('/:milestoneId', authorize('projects.manage'), asyncHandler(controller.delete));

  return router;
}
