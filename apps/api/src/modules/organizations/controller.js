export function createOrganizationController(service) {
  return {
    listMy: async (req, res) => {
      const result = await service.listMyOrgs(req.auth.userId);
      res.json(result);
    },
    listMembers: async (req, res) => {
      const result = await service.listMembers({ orgId: req.params.orgId });
      res.json(result);
    },
  };
}
