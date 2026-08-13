import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';

export function createNotificationRouter({ service, requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { limit, unread } = req.query;
      res.json(
        await service.list({
          userId: req.auth.userId,
          limit,
          unreadOnly: unread === 'true',
        }),
      );
    }),
  );

  router.get(
    '/unread-count',
    asyncHandler(async (req, res) => {
      res.json(await service.unreadCount({ userId: req.auth.userId }));
    }),
  );

  router.post(
    '/read-all',
    asyncHandler(async (req, res) => {
      res.json(await service.markAllRead({ userId: req.auth.userId }));
    }),
  );

  router.post(
    '/:id/read',
    asyncHandler(async (req, res) => {
      res.json(await service.markRead({ userId: req.auth.userId, id: req.params.id }));
    }),
  );

  return router;
}
