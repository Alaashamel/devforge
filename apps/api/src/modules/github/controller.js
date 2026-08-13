export function createGithubController(service) {
  return {
    beginOAuth: async (req, res) => {
      const result = await service.beginOAuth({ userId: req.auth.userId });
      res.json(result);
    },

    completeOAuth: async (req, res) => {
      try {
        await service.completeOAuth({ code: req.query.code, state: req.query.state });
        res.redirect(302, service.buildOAuthRedirect({ ok: true }));
      } catch (err) {
        res.redirect(302, service.buildOAuthRedirect({ ok: false, message: err.message }));
      }
    },

    getConnection: async (req, res) => {
      const result = await service.getConnection({ userId: req.auth.userId });
      res.json(result);
    },

    disconnect: async (req, res) => {
      await service.disconnect({ userId: req.auth.userId });
      res.status(204).end();
    },

    listRepositories: async (req, res) => {
      const result = await service.listRepositories({ orgId: req.params.orgId });
      res.json(result);
    },

    importRepository: async (req, res) => {
      const result = await service.importRepository({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        fullName: req.body.fullName,
      });
      res.status(201).json(result);
    },

    getRepository: async (req, res) => {
      const result = await service.getRepository({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
      });
      res.json(result);
    },

    syncRepository: async (req, res) => {
      const result = await service.syncRepository({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
        userId: req.auth.userId,
      });
      res.json(result);
    },

    removeRepository: async (req, res) => {
      await service.removeRepository({ orgId: req.params.orgId, repoId: req.params.repoId });
      res.status(204).end();
    },

    listPullRequests: async (req, res) => {
      const result = await service.listPullRequests({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
        query: req.query,
      });
      res.json(result);
    },

    listBranches: async (req, res) => {
      const result = await service.listBranches({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
        userId: req.auth.userId,
      });
      res.json(result);
    },

    listCommits: async (req, res) => {
      const result = await service.listCommits({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
        userId: req.auth.userId,
        branch: req.query.branch,
      });
      res.json(result);
    },

    listIssues: async (req, res) => {
      const result = await service.listIssues({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
        userId: req.auth.userId,
        query: req.query,
      });
      res.json(result);
    },

    listWebhooks: async (req, res) => {
      const result = await service.listWebhooks({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
      });
      res.json(result);
    },

    createWebhook: async (req, res) => {
      const result = await service.createWebhook({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
        userId: req.auth.userId,
        events: req.body.events,
      });
      res.status(201).json(result);
    },

    deleteWebhook: async (req, res) => {
      await service.deleteWebhook({
        orgId: req.params.orgId,
        repoId: req.params.repoId,
        webhookId: req.params.webhookId,
        userId: req.auth.userId,
      });
      res.status(204).end();
    },

    handleWebhook: async (req, res) => {
      const result = await service.handleWebhook({
        repoId: req.params.repoId,
        event: req.headers['x-github-event'],
        signature: req.headers['x-hub-signature-256'] ?? req.headers['x-hub-signature'],
        rawBody: req.rawBody,
      });
      res.json(result);
    },
  };
}
