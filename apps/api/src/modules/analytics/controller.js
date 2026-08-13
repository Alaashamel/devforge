export function createAnalyticsController(service) {
  return {
    getOverview: async (req, res) => {
      res.json(await service.getOverview({ orgId: req.params.orgId }));
    },

    getVelocity: async (req, res) => {
      res.json(await service.getVelocity({ orgId: req.params.orgId, weeks: req.query.weeks }));
    },

    getHealth: async (req, res) => {
      res.json(await service.getHealth({ orgId: req.params.orgId }));
    },

    getDevelopers: async (req, res) => {
      res.json(await service.getDevelopers({ orgId: req.params.orgId, weeks: req.query.weeks }));
    },

    listRepositorySummaries: async (req, res) => {
      res.json(await service.listRepositorySummaries({ orgId: req.params.orgId }));
    },

    getRepositoryActivity: async (req, res) => {
      res.json(
        await service.getRepositoryActivity({
          orgId: req.params.orgId,
          repoId: req.params.repoId,
        }),
      );
    },
  };
}
