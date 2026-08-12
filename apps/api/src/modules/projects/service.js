import { conflict, notFound } from '../../utils/errors.js';
import { isUniqueViolation } from '../../utils/db.js';
import { buildOrder, buildSearchClause, paginate, parsePagination } from '../../utils/list.js';

function mapProject(r) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    key: r.key,
    description: r.description ?? null,
    status: r.status,
    defaultPriority: r.default_priority,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMember(r) {
  return {
    userId: r.user_id,
    name: r.name,
    email: r.email,
    avatarUrl: r.avatar_url ?? null,
    role: r.role,
    joinedAt: r.joined_at ?? r.created_at,
  };
}

export function createProjectService({ pool }) {
  async function getOrg(orgId) {
    const { rows } = await pool.query(
      'SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL',
      [orgId],
    );
    return rows[0] ?? null;
  }

  async function getProject(orgId, projectId, { includeCounts = false } = {}) {
    const { rows } = await pool.query(
      `SELECT p.*,
              count(DISTINCT pm.user_id)::int AS member_count,
              count(DISTINCT t.id)::int AS task_count
         FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id
         LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
        WHERE p.organization_id = $1 AND p.id = $2 AND p.deleted_at IS NULL
        GROUP BY p.id`,
      [orgId, projectId],
    );
    const project = rows[0] ?? null;
    if (!project) {
      return null;
    }
    const data = { ...mapProject(project), memberCount: project.member_count, taskCount: project.task_count };
    if (!includeCounts) {
      return data;
    }
    const { rows: statusRows } = await pool.query(
      `SELECT status, count(*)::int AS count
         FROM tasks
        WHERE project_id = $1 AND deleted_at IS NULL
        GROUP BY status`,
      [projectId],
    );
    const { rows: milestoneRows } = await pool.query(
      `SELECT count(*)::int AS count FROM milestones WHERE project_id = $1`,
      [projectId],
    );
    return {
      ...data,
      taskCounts: { total: data.taskCount, byStatus: Object.fromEntries(statusRows.map((s) => [s.status, s.count])) },
      milestoneCount: milestoneRows[0].count,
    };
  }

  async function listProjects({ orgId, query }) {
    const org = await getOrg(orgId);
    if (!org) {
      throw notFound('Organization not found');
    }
    const { page, pageSize, limit, offset } = parsePagination(query);
    const conditions = ['p.organization_id = $1', 'p.deleted_at IS NULL'];
    const params = [orgId];

    if (query.status === 'active' || query.status === 'archived') {
      params.push(query.status);
      conditions.push(`p.status = $${params.length}`);
    }
    const { sql: searchSql, params: searchParams } = buildSearchClause(query.q, ['p.name', 'p.key']);
    if (searchSql) {
      params.push(...searchParams);
      conditions.push(searchSql.replaceAll('$1', `$${params.length - searchParams.length + 1}`));
    }

    const orderBy = buildOrder(query.sort, ['p.name', 'p.key', 'p.status', 'p.created_at', 'p.updated_at'], 'p.created_at DESC');
    const baseFrom = `projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL`;
    const select = `SELECT p.id, p.organization_id, p.name, p.key, p.description, p.status,
                           p.default_priority, p.created_by, p.created_at, p.updated_at,
                           count(DISTINCT pm.user_id)::int AS member_count,
                           count(DISTINCT t.id)::int AS task_count`;

    const result = await paginate(pool, {
      baseFrom,
      where: conditions.join(' AND '),
      params,
      orderBy,
      select,
      groupBy: 'GROUP BY p.id',
      countDistinct: 'p.id',
      page,
      pageSize,
    });
    return {
      data: result.data.map((r) => ({
        ...mapProject(r),
        memberCount: r.member_count,
        taskCount: r.task_count,
      })),
      meta: { ...result.meta, limit, offset },
    };
  }

  async function createProject({ orgId, userId, input }) {
    const org = await getOrg(orgId);
    if (!org) {
      throw notFound('Organization not found');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let inserted;
      try {
        const { rows } = await client.query(
          `INSERT INTO projects (organization_id, name, key, description, default_priority, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [orgId, input.name, input.key, input.description ?? null, input.defaultPriority ?? 'medium', userId],
        );
        inserted = rows[0];
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw conflict(`A project with key '${input.key}' already exists in this organization`);
        }
        throw err;
      }
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [inserted.id, userId],
      );
      await client.query('COMMIT');
      return { data: mapProject(inserted) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function getProjectDetail({ orgId, projectId }) {
    const project = await getProject(orgId, projectId, { includeCounts: true });
    if (!project) {
      throw notFound('Project not found');
    }
    return { data: project };
  }

  async function updateProject({ orgId, projectId, input }) {
    const current = await getProject(orgId, projectId);
    if (!current) {
      throw notFound('Project not found');
    }
    const fields = [];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    };
    if (input.name !== undefined) push('name', input.name);
    if (input.description !== undefined) push('description', input.description);
    if (input.status !== undefined) push('status', input.status);
    if (input.defaultPriority !== undefined) push('default_priority', input.defaultPriority);
    if (fields.length === 0) {
      return { data: await getProject(orgId, projectId) };
    }
    params.push(projectId, orgId);
    const { rows } = await pool.query(
      `UPDATE projects SET ${fields.join(', ')}, updated_at = now()
        WHERE id = $${params.length - 1} AND organization_id = $${params.length} AND deleted_at IS NULL
        RETURNING *`,
      params,
    );
    return { data: mapProject(rows[0]) };
  }

  async function deleteProject({ orgId, projectId }) {
    const current = await getProject(orgId, projectId);
    if (!current) {
      throw notFound('Project not found');
    }
    await pool.query(
      `UPDATE projects SET deleted_at = now(), status = 'archived', updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [projectId, orgId],
    );
    return { ok: true };
  }

  async function listMembers({ orgId, projectId }) {
    const project = await getProject(orgId, projectId);
    if (!project) {
      throw notFound('Project not found');
    }
    const { rows } = await pool.query(
      `SELECT pm.user_id, u.name, u.email, u.avatar_url, pm.role, pm.created_at
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY CASE pm.role
          WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'maintainer' THEN 3
          WHEN 'developer' THEN 4 ELSE 5 END, u.name ASC`,
      [projectId],
    );
    return { data: rows.map(mapMember) };
  }

  async function setMember({ orgId, projectId, userId, role }) {
    const project = await getProject(orgId, projectId);
    if (!project) {
      throw notFound('Project not found');
    }
    const { rows: userRows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userRows.length === 0) {
      throw notFound('User not found');
    }
    const { rows } = await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()
       RETURNING *`,
      [projectId, userId, role],
    );
    return { data: { projectId, userId, role: rows[0].role } };
  }

  async function removeMember({ orgId, projectId, userId }) {
    const project = await getProject(orgId, projectId);
    if (!project) {
      throw notFound('Project not found');
    }
    const { rows: ownerRows } = await pool.query(
      `SELECT count(*)::int AS owners FROM project_members
        WHERE project_id = $1 AND role = 'owner'`,
      [projectId],
    );
    const { rows: targetRows } = await pool.query(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId],
    );
    if (targetRows.length === 0) {
      return { ok: true };
    }
    if (targetRows[0].role === 'owner' && ownerRows[0].owners <= 1) {
      throw conflict('A project must have at least one owner');
    }
    await pool.query(
      'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId],
    );
    return { ok: true };
  }

  return {
    listProjects,
    createProject,
    getProjectDetail,
    updateProject,
    deleteProject,
    listMembers,
    setMember,
    removeMember,
  };
}
