import { notFound } from '../../utils/errors.js';
import { formatDate } from '../../utils/date.js';

function mapMilestone(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description ?? null,
    startDate: formatDate(r.start_date),
    dueDate: formatDate(r.due_date),
    status: r.status,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createMilestoneService({ pool }) {
  async function projectExists(projectId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId],
    );
    return rows.length > 0;
  }

  async function getMilestone(projectId, milestoneId) {
    const { rows } = await pool.query(
      'SELECT * FROM milestones WHERE project_id = $1 AND id = $2',
      [projectId, milestoneId],
    );
    return rows[0] ?? null;
  }

  async function listMilestones({ projectId }) {
    if (!(await projectExists(projectId))) {
      throw notFound('Project not found');
    }
    const { rows } = await pool.query(
      `SELECT m.*, count(t.id)::int AS task_count
         FROM milestones m
         LEFT JOIN tasks t ON t.milestone_id = m.id AND t.deleted_at IS NULL
        WHERE m.project_id = $1
        GROUP BY m.id
        ORDER BY m.position ASC, m.due_date ASC NULLS LAST, m.created_at ASC`,
      [projectId],
    );
    return { data: rows.map((r) => ({ ...mapMilestone(r), taskCount: r.task_count })) };
  }

  async function createMilestone({ projectId, input }) {
    if (!(await projectExists(projectId))) {
      throw notFound('Project not found');
    }
    const { rows } = await pool.query(
      `INSERT INTO milestones (project_id, title, description, start_date, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        projectId,
        input.title,
        input.description ?? null,
        input.startDate ?? null,
        input.dueDate ?? null,
        input.status ?? 'planned',
      ],
    );
    return { data: mapMilestone(rows[0]) };
  }

  async function updateMilestone({ projectId, milestoneId, input }) {
    const current = await getMilestone(projectId, milestoneId);
    if (!current) {
      throw notFound('Milestone not found');
    }
    const fields = [];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    };
    if (input.title !== undefined) push('title', input.title);
    if (input.description !== undefined) push('description', input.description);
    if (input.startDate !== undefined) push('start_date', input.startDate);
    if (input.dueDate !== undefined) push('due_date', input.dueDate);
    if (input.status !== undefined) push('status', input.status);
    if (input.position !== undefined) push('position', input.position);
    if (fields.length === 0) {
      return { data: mapMilestone(current) };
    }
    params.push(projectId, milestoneId);
    const { rows } = await pool.query(
      `UPDATE milestones SET ${fields.join(', ')}, updated_at = now()
        WHERE project_id = $${params.length - 1} AND id = $${params.length}
        RETURNING *`,
      params,
    );
    return { data: mapMilestone(rows[0]) };
  }

  async function deleteMilestone({ projectId, milestoneId }) {
    const current = await getMilestone(projectId, milestoneId);
    if (!current) {
      throw notFound('Milestone not found');
    }
    await pool.query('DELETE FROM milestones WHERE id = $1 AND project_id = $2', [milestoneId, projectId]);
    return { ok: true };
  }

  return { listMilestones, createMilestone, updateMilestone, deleteMilestone };
}
