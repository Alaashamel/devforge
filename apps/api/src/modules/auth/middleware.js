import { forbidden, unauthorized } from '../../utils/errors.js';
import { hasPermission } from './permissions.js';

export function createAuthMiddleware({ accessTokens, resolveRole }) {
  return {
    requireAuth: async (req, _res, next) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return next(unauthorized('Authentication required'));
      }
      const token = header.slice('Bearer '.length).trim();
      const claims = await accessTokens.verify(token);
      if (!claims) {
        return next(unauthorized('Invalid or expired access token'));
      }
      req.auth = claims;
      return next();
    },

    authorize: (permission) => async (req, _res, next) => {
      if (!req.auth) {
        return next(unauthorized('Authentication required'));
      }
      const role = await resolveRole({
        userId: req.auth.userId,
        orgId: req.params.orgId,
        projectId: req.params.projectId,
      });
      if (!role || !hasPermission(role, permission)) {
        return next(forbidden(`Permission '${permission}' is required`));
      }
      return next();
    },
  };
}
