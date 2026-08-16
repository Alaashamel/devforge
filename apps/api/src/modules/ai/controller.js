import { Readable } from 'node:stream';

export function createAiController(service) {
  return {
    createAnalysis: async (req, res) => {
      const result = await service.createAnalysis({
        orgId: req.params.orgId,
        repoId: req.body.repositoryId,
        type: req.body.type,
        pullRequestNumber: req.body.pullRequestNumber,
      });
      res.status(202).json(result);
    },

    listAnalyses: async (req, res) => {
      const result = await service.listAnalyses({
        orgId: req.params.orgId,
        repositoryId: req.query.repositoryId,
        type: req.query.type,
        pullRequestNumber: req.query.pullRequestNumber,
      });
      res.json(result);
    },

    getAnalysis: async (req, res) => {
      const result = await service.getAnalysis({
        orgId: req.params.orgId,
        analysisId: req.params.analysisId,
      });
      res.json(result);
    },

    approveAnalysis: async (req, res) => {
      const result = await service.approveAnalysis({
        orgId: req.params.orgId,
        analysisId: req.params.analysisId,
        filePath: req.body.filePath,
        message: req.body.message,
      });
      res.json(result);
    },

    getJobStatus: async (req, res) => {
      const result = await service.getJobStatus({
        orgId: req.params.orgId,
        jobId: req.params.jobId,
      });
      res.json(result);
    },

    listConversations: async (req, res) => {
      const result = await service.listConversations({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        repositoryId: req.query.repositoryId,
      });
      res.json(result);
    },

    getConversation: async (req, res) => {
      const result = await service.getConversation({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        conversationId: req.params.conversationId,
      });
      res.json(result);
    },

    createConversation: async (req, res) => {
      const result = await service.createConversation({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        repositoryId: req.body.repositoryId,
        title: req.body.title,
      });
      res.status(201).json(result);
    },

    deleteConversation: async (req, res) => {
      const result = await service.deleteConversation({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        conversationId: req.params.conversationId,
      });
      res.json(result);
    },

    listMessages: async (req, res) => {
      const result = await service.listMessages({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        conversationId: req.params.conversationId,
      });
      res.json(result);
    },

    streamAssistantReply: async (req, res) => {
      const { stream } = await service.streamAssistantReply({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        conversationId: req.params.conversationId,
        content: req.body.content,
      });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          res.write(value);
        }
        res.end();
      } catch {
        res.destroy();
      }
    },

    streamArchive: async (req, res) => {
      const { repo, response } = await service.streamArchive({
        repoId: req.params.repoId,
        token: req.query.token,
      });
      res.setHeader('Content-Type', 'application/x-tar');
      res.setHeader('Content-Disposition', `attachment; filename="${repo.full_name}.tar.gz"`);
      if (response?.body) {
        if (typeof response.body.pipe === 'function') {
          response.body.pipe(res);
          return;
        }
        if (typeof response.body.getReader === 'function') {
          Readable.fromWeb(response.body).pipe(res);
          return;
        }
        res.send(Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body));
        return;
      }
      if (Buffer.isBuffer(response)) {
        res.send(response);
        return;
      }
      res.status(502).json({
        error: { code: 'ARCHIVE_STREAM_FAILED', message: 'Archive stream unavailable' },
      });
    },
  };
}
