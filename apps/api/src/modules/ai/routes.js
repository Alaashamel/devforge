import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createAiController } from './controller.js';
import {
  approveAnalysisSchema,
  createAnalysisSchema,
  createConversationSchema,
  streamMessageSchema,
} from './schemas.js';

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
  router.get('/analyses/:analysisId', authorize('project.view'), asyncHandler(controller.getAnalysis));
  router.post(
    '/analyses/:analysisId/approve',
    authorize('ai.run'),
    validate(approveAnalysisSchema),
    asyncHandler(controller.approveAnalysis),
  );
  router.get('/jobs/:jobId', authorize('project.view'), asyncHandler(controller.getJobStatus));

  router.get(
    '/conversations',
    authorize('project.view'),
    asyncHandler(controller.listConversations),
  );
  router.post(
    '/conversations',
    authorize('ai.run'),
    validate(createConversationSchema),
    asyncHandler(controller.createConversation),
  );
  router.get(
    '/conversations/:conversationId',
    authorize('project.view'),
    asyncHandler(controller.getConversation),
  );
  router.delete(
    '/conversations/:conversationId',
    authorize('ai.run'),
    asyncHandler(controller.deleteConversation),
  );
  router.get(
    '/conversations/:conversationId/messages',
    authorize('project.view'),
    asyncHandler(controller.listMessages),
  );
  router.post(
    '/conversations/:conversationId/stream',
    authorize('ai.run'),
    validate(streamMessageSchema),
    asyncHandler(controller.streamAssistantReply),
  );

  return router;
}

export function createAiArchiveRouter({ service }) {
  const controller = createAiController(service);
  const router = Router();
  router.get('/:repoId', asyncHandler(controller.streamArchive));
  return router;
}
