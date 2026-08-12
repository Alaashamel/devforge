import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createProjectController } from './controller.js';
import { createProjectSchema, setMemberSchema, updateProjectSchema } from './schemas.js';

export function createProjectRouter({ service, authorize }) {
  const controller = createProjectController(service);
  const router = Router({ mergeParams: true });

  router.get('/', authorize('project.view'), asyncHandler(controller.list));
  router.post('/', authorize('projects.create'), validate(createProjectSchema), asyncHandler(controller.create));
  router.get('/:projectId', authorize('project.view'), asyncHandler(controller.get));
  router.patch('/:projectId', authorize('projects.manage'), validate(updateProjectSchema), asyncHandler(controller.update));
  router.delete('/:projectId', authorize('projects.delete'), asyncHandler(controller.delete));

  router.get('/:projectId/members', authorize('project.view'), asyncHandler(controller.listMembers));
  router.put('/:projectId/members/:userId', authorize('projects.manage'), validate(setMemberSchema), asyncHandler(controller.setMember));
  router.delete('/:projectId/members/:userId', authorize('projects.manage'), asyncHandler(controller.removeMember));

  return router;
}
