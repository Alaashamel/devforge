import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';

export function createChatRouter({ service, requireAuth, authorize }) {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, authorize('project.view'));

  router.get(
    '/messages',
    asyncHandler(async (req, res) => {
      const { before, limit } = req.query;
      res.json(
        await service.listMessages({ orgId: req.params.orgId, before, limit }),
      );
    }),
  );

  router.post(
    '/messages',
    asyncHandler(async (req, res) => {
      res.json(
        await service.sendMessage({
          orgId: req.params.orgId,
          userId: req.auth.userId,
          body: req.body.body,
        }),
      );
    }),
  );

  return router;
}
