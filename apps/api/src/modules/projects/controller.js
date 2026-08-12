export function createProjectController(service) {
  return {
    list: async (req, res) => {
      const result = await service.listProjects({ orgId: req.params.orgId, query: req.query });
      res.json(result);
    },

    create: async (req, res) => {
      const result = await service.createProject({
        orgId: req.params.orgId,
        userId: req.auth.userId,
        input: req.body,
      });
      res.status(201).json(result);
    },

    get: async (req, res) => {
      const result = await service.getProjectDetail({
        orgId: req.params.orgId,
        projectId: req.params.projectId,
      });
      res.json(result);
    },

    update: async (req, res) => {
      const result = await service.updateProject({
        orgId: req.params.orgId,
        projectId: req.params.projectId,
        input: req.body,
      });
      res.json(result);
    },

    delete: async (req, res) => {
      await service.deleteProject({ orgId: req.params.orgId, projectId: req.params.projectId });
      res.status(204).end();
    },

    listMembers: async (req, res) => {
      const result = await service.listMembers({
        orgId: req.params.orgId,
        projectId: req.params.projectId,
      });
      res.json(result);
    },

    setMember: async (req, res) => {
      const result = await service.setMember({
        orgId: req.params.orgId,
        projectId: req.params.projectId,
        userId: req.params.userId,
        role: req.body.role,
      });
      res.json(result);
    },

    removeMember: async (req, res) => {
      await service.removeMember({
        orgId: req.params.orgId,
        projectId: req.params.projectId,
        userId: req.params.userId,
      });
      res.status(204).end();
    },
  };
}
