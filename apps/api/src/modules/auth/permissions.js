export const ROLES = ['owner', 'admin', 'maintainer', 'developer', 'viewer'];

export const ROLE_WEIGHT = { owner: 5, admin: 4, maintainer: 3, developer: 2, viewer: 1 };

const MATRIX = {
  'org.manage': ['owner', 'admin'],
  'members.manage': ['owner', 'admin'],
  'projects.create': ['owner', 'admin', 'maintainer'],
  'projects.delete': ['owner', 'admin', 'maintainer'],
  'tasks.manage': ['owner', 'admin', 'maintainer', 'developer'],
  'project.view': ['owner', 'admin', 'maintainer', 'developer', 'viewer'],
  'ai.run': ['owner', 'admin', 'maintainer', 'developer'],
  'repos.manage': ['owner', 'admin', 'maintainer'],
};

export function hasPermission(role, permission) {
  const allowed = MATRIX[permission];
  if (!allowed) {
    throw new Error(`unknown permission: ${permission}`);
  }
  return allowed.includes(role);
}

export function maxRole(a, b) {
  const weightA = ROLE_WEIGHT[a] ?? 0;
  const weightB = ROLE_WEIGHT[b] ?? 0;
  return weightA >= weightB ? a : b;
}
