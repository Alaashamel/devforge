export function createOrganizationService({ pool }) {
  async function listMyOrgs(userId) {
    const { rows } = await pool.query(
      `SELECT o.id, o.name, o.slug, o.plan, o.avatar_url,
              CASE WHEN o.owner_id = $1 THEN 'owner' ELSE om.role END AS role,
              o.created_at
         FROM organizations o
         LEFT JOIN organization_members om
           ON om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
        WHERE o.owner_id = $1 OR om.user_id = $1
        ORDER BY o.name ASC`,
      [userId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      plan: r.plan,
      avatarUrl: r.avatar_url ?? null,
      role: r.role,
      createdAt: r.created_at,
    }));
    return { data, meta: { page: 1, pageSize: data.length, total: data.length, totalPages: data.length > 0 ? 1 : 0 } };
  }

  async function listMembers({ orgId }) {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.avatar_url, om.role,
              CASE WHEN o.owner_id = u.id THEN 'owner' ELSE om.role END AS effective_role,
              om.joined_at
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         JOIN organizations o ON o.id = om.organization_id
        WHERE om.organization_id = $1 AND om.status = 'active'
        ORDER BY u.name ASC`,
      [orgId],
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        avatarUrl: r.avatar_url ?? null,
        role: r.effective_role,
        joinedAt: r.joined_at,
      })),
    };
  }

  return { listMyOrgs, listMembers };
}
