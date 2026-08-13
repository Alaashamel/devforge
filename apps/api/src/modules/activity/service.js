function mapActivity(r) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    actorId: r.actor_id,
    actor: r.actor_name ? { id: r.actor_id, name: r.actor_name, avatarUrl: r.actor_avatar_url ?? null } : null,
    type: r.type,
    subjectType: r.subject_type,
    subjectId: r.subject_id ?? null,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
  };
}

const ACTIVITY_SELECT = `
  SELECT a.id, a.organization_id, a.actor_id, a.type, a.subject_type, a.subject_id,
         a.metadata, a.created_at, u.name AS actor_name, u.avatar_url AS actor_avatar_url
    FROM activities a
    JOIN users u ON u.id = a.actor_id`;

/**
 * Organization-scoped activity feed. `record` persists an activity and
 * broadcasts it to the `org:{id}` room so the activity feed updates live.
 */
export function createActivityService({ pool, realtime }) {
  async function list({ orgId, limit = 50 }) {
    const numLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const { rows } = await pool.query(
      `${ACTIVITY_SELECT}
        WHERE a.organization_id = $1
        ORDER BY a.created_at DESC
        LIMIT ${numLimit}`,
      [orgId],
    );
    return { data: rows.map(mapActivity) };
  }

  async function record({ orgId, actorId, type, subjectType, subjectId, metadata }) {
    const { rows } = await pool.query(
      `INSERT INTO activities (organization_id, actor_id, type, subject_type, subject_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orgId, actorId, type, subjectType, subjectId ?? null, metadata ?? {}],
    );
    const { rows: actorRows } = await pool.query(
      'SELECT name, avatar_url FROM users WHERE id = $1',
      [actorId],
    );
    const activity = {
      ...mapActivity(rows[0]),
      actor: actorRows[0]
        ? { id: actorId, name: actorRows[0].name, avatarUrl: actorRows[0].avatar_url ?? null }
        : null,
    };
    realtime?.emitToRoom?.(`org:${orgId}`, 'activity:new', { activity });
    return activity;
  }

  return { list, record };
}
