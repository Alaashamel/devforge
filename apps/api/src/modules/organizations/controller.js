export function createOrganizationController(service) {
  return {
    listMy: async (req, res) => {
      const result = await service.listMyOrgs(req.auth.userId);
      res.json(result);
    },
  };
}
