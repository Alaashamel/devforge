function requestMeta(req) {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
  };
}

export function createAuthController(service) {
  return {
    register: async (req, res) => {
      const data = await service.register({ ...req.body, meta: requestMeta(req) });
      res.status(201).json({ data });
    },

    login: async (req, res) => {
      const data = await service.login({ ...req.body, meta: requestMeta(req) });
      res.json({ data });
    },

    refresh: async (req, res) => {
      const data = await service.refresh({ ...req.body, meta: requestMeta(req) });
      res.json({ data });
    },

    logout: async (req, res) => {
      await service.logout(req.body);
      res.status(204).end();
    },

    verifyEmail: async (req, res) => {
      const data = await service.verifyEmail(req.body);
      res.json({ data });
    },

    forgotPassword: async (req, res) => {
      await service.forgotPassword(req.body);
      res.status(202).json({ data: { ok: true } });
    },

    resetPassword: async (req, res) => {
      await service.resetPassword(req.body);
      res.json({ data: { ok: true } });
    },

    me: async (req, res) => {
      const data = await service.getProfile(req.auth.userId);
      res.json({ data });
    },
  };
}
