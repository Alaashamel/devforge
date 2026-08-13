import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createGithubController } from './controller.js';
import { createWebhookSchema, importRepositorySchema } from './schemas.js';

export function createGithubRouter({ service, requireAuth }) {
  const controller = createGithubController(service);
  const router = Router();

  router.post('/oauth/begin', requireAuth, asyncHandler(controller.beginOAuth));
  router.get('/oauth/callback', asyncHandler(controller.completeOAuth));
  router.get('/connection', requireAuth, asyncHandler(controller.getConnection));
  router.post('/disconnect', requireAuth, asyncHandler(controller.disconnect));

  return router;
}

export function createRepositoryRouter({ service, authorize }) {
  const controller = createGithubController(service);
  const router = Router({ mergeParams: true });

  router.get('/', authorize('project.view'), asyncHandler(controller.listRepositories));
  router.post(
    '/import',
    authorize('repos.manage'),
    validate(importRepositorySchema),
    asyncHandler(controller.importRepository),
  );
  router.get('/:repoId', authorize('project.view'), asyncHandler(controller.getRepository));
  router.post('/:repoId/sync', authorize('repos.manage'), asyncHandler(controller.syncRepository));
  router.delete('/:repoId', authorize('repos.manage'), asyncHandler(controller.removeRepository));
  router.get(
    '/:repoId/pull-requests',
    authorize('project.view'),
    asyncHandler(controller.listPullRequests),
  );
  router.get('/:repoId/branches', authorize('project.view'), asyncHandler(controller.listBranches));
  router.get('/:repoId/commits', authorize('project.view'), asyncHandler(controller.listCommits));
  router.get('/:repoId/issues', authorize('project.view'), asyncHandler(controller.listIssues));
  router.get('/:repoId/webhooks', authorize('project.view'), asyncHandler(controller.listWebhooks));
  router.post(
    '/:repoId/webhooks',
    authorize('repos.manage'),
    validate(createWebhookSchema),
    asyncHandler(controller.createWebhook),
  );
  router.delete(
    '/:repoId/webhooks/:webhookId',
    authorize('repos.manage'),
    asyncHandler(controller.deleteWebhook),
  );

  return router;
}
