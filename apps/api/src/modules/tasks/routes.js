import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createTaskController } from './controller.js';
import {
  createCommentSchema,
  createDependencySchema,
  createTaskSchema,
  setTaskLabelsSchema,
  updateCommentSchema,
  updateTaskSchema,
} from './schemas.js';

export function createTaskRouter({ service, authorize }) {
  const controller = createTaskController(service);
  const router = Router({ mergeParams: true });

  router.get('/', authorize('project.view'), asyncHandler(controller.list));
  router.post('/', authorize('tasks.manage'), validate(createTaskSchema), asyncHandler(controller.create));
  router.get('/:taskId', authorize('project.view'), asyncHandler(controller.get));
  router.patch('/:taskId', authorize('tasks.manage'), validate(updateTaskSchema), asyncHandler(controller.update));
  router.delete('/:taskId', authorize('tasks.manage'), asyncHandler(controller.delete));

  router.get('/:taskId/comments', authorize('project.view'), asyncHandler(controller.listComments));
  router.post('/:taskId/comments', authorize('project.view'), validate(createCommentSchema), asyncHandler(controller.createComment));
  router.patch('/:taskId/comments/:commentId', authorize('project.view'), validate(updateCommentSchema), asyncHandler(controller.updateComment));
  router.delete('/:taskId/comments/:commentId', authorize('project.view'), asyncHandler(controller.deleteComment));

  router.put('/:taskId/labels', authorize('tasks.manage'), validate(setTaskLabelsSchema), asyncHandler(controller.setLabels));
  router.get('/:taskId/activity', authorize('project.view'), asyncHandler(controller.listActivity));
  router.get('/:taskId/dependencies', authorize('project.view'), asyncHandler(controller.listDependencies));
  router.post('/:taskId/dependencies', authorize('tasks.manage'), validate(createDependencySchema), asyncHandler(controller.createDependency));
  router.delete('/:taskId/dependencies/:dependsOnId', authorize('tasks.manage'), asyncHandler(controller.deleteDependency));

  return router;
}
