export function createMilestoneController(service) {
  return {
    list: async (req, res) => {
      const result = await service.listMilestones({ projectId: req.params.projectId });
      res.json(result);
    },

    create: async (req, res) => {
      const result = await service.createMilestone({ projectId: req.params.projectId, input: req.body });
      res.status(201).json(result);
    },

    update: async (req, res) => {
      const result = await service.updateMilestone({
        projectId: req.params.projectId,
        milestoneId: req.params.milestoneId,
        input: req.body,
      });
      res.json(result);
    },

    delete: async (req, res) => {
      await service.deleteMilestone({
        projectId: req.params.projectId,
        milestoneId: req.params.milestoneId,
      });
      res.status(204).end();
    },
  };
}
