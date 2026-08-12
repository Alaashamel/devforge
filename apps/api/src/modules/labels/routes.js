import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createLabelController } from './controller.js';
import { createLabelSchema, updateLabelSchema } from './schemas.js';

export function createLabelRouter({ service, authorize }) {
  const controller = createLabelController(service);
  const router = Router({ mergeParams: true });

  router.get('/', authorize('project.view'), asyncHandler(controller.list));
  router.post('/', authorize('projects.manage'), validate(createLabelSchema), asyncHandler(controller.create));
  router.patch('/:labelId', authorize('projects.manage'), validate(updateLabelSchema), asyncHandler(controller.update));
  router.delete('/:labelId', authorize('projects.manage'), asyncHandler(controller.delete));

  return router;
}
