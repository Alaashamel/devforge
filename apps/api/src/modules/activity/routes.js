import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';

export function createActivityRouter({ service, requireAuth, authorize }) {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, authorize('project.view'));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { limit } = req.query;
      res.json(await service.list({ orgId: req.params.orgId, limit }));
    }),
  );

  return router;
}
