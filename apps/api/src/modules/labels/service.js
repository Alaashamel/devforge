import { conflict, notFound } from '../../utils/errors.js';
import { isUniqueViolation } from '../../utils/db.js';

function mapLabel(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    color: r.color,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createLabelService({ pool }) {
  async function projectExists(projectId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId],
    );
    return rows.length > 0;
  }

  async function getLabel(projectId, labelId) {
    const { rows } = await pool.query(
      'SELECT * FROM labels WHERE project_id = $1 AND id = $2',
      [projectId, labelId],
    );
    return rows[0] ?? null;
  }

  async function listLabels({ projectId }) {
    if (!(await projectExists(projectId))) {
      throw notFound('Project not found');
    }
    const { rows } = await pool.query(
      `SELECT l.*, count(tl.task_id)::int AS task_count
         FROM labels l
         LEFT JOIN task_labels tl ON tl.label_id = l.id
        WHERE l.project_id = $1
        GROUP BY l.id
        ORDER BY l.name ASC`,
      [projectId],
    );
    return { data: rows.map((r) => ({ ...mapLabel(r), taskCount: r.task_count })) };
  }

  async function createLabel({ projectId, input }) {
    if (!(await projectExists(projectId))) {
      throw notFound('Project not found');
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO labels (project_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [projectId, input.name, input.color ?? '#64748b'],
      );
      return { data: mapLabel(rows[0]) };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict(`A label named '${input.name}' already exists in this project`);
      }
      throw err;
    }
  }

  async function updateLabel({ projectId, labelId, input }) {
    const current = await getLabel(projectId, labelId);
    if (!current) {
      throw notFound('Label not found');
    }
    const fields = [];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    };
    if (input.name !== undefined) push('name', input.name);
    if (input.color !== undefined) push('color', input.color);
    if (fields.length === 0) {
      return { data: mapLabel(current) };
    }
    try {
      params.push(projectId, labelId);
      const { rows } = await pool.query(
        `UPDATE labels SET ${fields.join(', ')}, updated_at = now()
          WHERE project_id = $${params.length - 1} AND id = $${params.length}
          RETURNING *`,
        params,
      );
      return { data: mapLabel(rows[0]) };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict(`A label named '${input.name}' already exists in this project`);
      }
      throw err;
    }
  }

  async function deleteLabel({ projectId, labelId }) {
    const current = await getLabel(projectId, labelId);
    if (!current) {
      throw notFound('Label not found');
    }
    await pool.query('DELETE FROM labels WHERE id = $1 AND project_id = $2', [labelId, projectId]);
    return { ok: true };
  }

  return { listLabels, createLabel, updateLabel, deleteLabel };
}
