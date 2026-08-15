import { Readable } from 'node:stream';

export function createAiController(service) {
  return {
    createAnalysis: async (req, res) => {
      const result = await service.createAnalysis({
        orgId: req.params.orgId,
        repoId: req.body.repositoryId,
        type: req.body.type,
      });
      res.status(202).json(result);
    },

    listAnalyses: async (req, res) => {
      const result = await service.listAnalyses({
        orgId: req.params.orgId,
        repositoryId: req.query.repositoryId,
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

    getJobStatus: async (req, res) => {
      const result = await service.getJobStatus({
        orgId: req.params.orgId,
        jobId: req.params.jobId,
      });
      res.json(result);
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
