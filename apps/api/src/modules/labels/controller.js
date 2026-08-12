export function createLabelController(service) {
  return {
    list: async (req, res) => {
      const result = await service.listLabels({ projectId: req.params.projectId });
      res.json(result);
    },

    create: async (req, res) => {
      const result = await service.createLabel({ projectId: req.params.projectId, input: req.body });
      res.status(201).json(result);
    },

    update: async (req, res) => {
      const result = await service.updateLabel({
        projectId: req.params.projectId,
        labelId: req.params.labelId,
        input: req.body,
      });
      res.json(result);
    },

    delete: async (req, res) => {
      await service.deleteLabel({ projectId: req.params.projectId, labelId: req.params.labelId });
      res.status(204).end();
    },
  };
}
