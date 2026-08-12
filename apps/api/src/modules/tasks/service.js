import { conflict, forbidden, notFound } from '../../utils/errors.js';
import { hasPermission } from '../auth/permissions.js';
import { formatDate } from '../../utils/date.js';
import { buildOrder, buildSearchClause, paginate, parsePagination } from '../../utils/list.js';

function buildLabels(r) {
  if (!r.label_ids) {
    return [];
  }
  return r.label_ids.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
  }));
}

function mapTask(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    milestoneId: r.milestone_id ?? null,
    parentId: r.parent_id ?? null,
    type: r.type,
    status: r.status,
    priority: r.priority,
    title: r.title,
    description: r.description ?? null,
    assigneeId: r.assignee_id ?? null,
    assignee: r.assignee_id
      ? { id: r.assignee_id, name: r.assignee_name ?? null, email: r.assignee_email ?? null }
      : null,
    reporterId: r.reporter_id,
    dueDate: formatDate(r.due_date),
    estimate: r.estimate ?? null,
    position: r.position,
    labels: buildLabels(r),
    commentCount: r.comment_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const TASK_SELECT = `
  SELECT t.*, u.name AS assignee_name, u.email AS assignee_email,
         (SELECT count(*)::int FROM task_comments c WHERE c.task_id = t.id AND c.deleted_at IS NULL) AS comment_count,
         COALESCE(array_agg(DISTINCT jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color))
                  FILTER (WHERE l.id IS NOT NULL), '{}') AS label_ids
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN task_labels tl ON tl.task_id = t.id
    LEFT JOIN labels l ON l.id = tl.label_id`;

const TASK_GROUP = 'GROUP BY t.id, u.name, u.email';

export function createTaskService({ pool, resolveRole }) {
  async function projectExists(projectId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId],
    );
    return rows.length > 0;
  }

  async function getTaskRow(projectId, taskId) {
    const { rows } = await pool.query(
      `${TASK_SELECT}
        WHERE t.project_id = $1 AND t.id = $2 AND t.deleted_at IS NULL
        ${TASK_GROUP}`,
      [projectId, taskId],
    );
    return rows[0] ?? null;
  }

  async function assertProject(projectId) {
    if (!(await projectExists(projectId))) {
      throw notFound('Project not found');
    }
  }

  async function validateReferences(projectId, input) {
    if (input.milestoneId !== undefined && input.milestoneId !== null) {
      const { rows } = await pool.query(
        'SELECT 1 FROM milestones WHERE id = $1 AND project_id = $2',
        [input.milestoneId, projectId],
      );
      if (rows.length === 0) {
        throw conflict('Milestone does not belong to this project');
      }
    }
    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      const { rows } = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, input.assigneeId],
      );
      if (rows.length === 0) {
        throw conflict('Assignee must be a member of this project');
      }
    }
    if (input.parentId !== undefined && input.parentId !== null) {
      const { rows } = await pool.query(
        'SELECT 1 FROM tasks WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL',
        [input.parentId, projectId],
      );
      if (rows.length === 0) {
        throw conflict('Parent task does not belong to this project');
      }
    }
  }

  async function assertLabelsBelong(client, projectId, labelIds) {
    if (labelIds.length === 0) {
      return;
    }
    const { rows } = await client.query(
      'SELECT id FROM labels WHERE id = ANY($1::uuid[]) AND project_id = $2',
      [labelIds, projectId],
    );
    if (rows.length !== labelIds.length) {
      throw conflict('One or more labels do not belong to this project');
    }
  }

  async function replaceLabels(client, { projectId, taskId, actorId, labelIds }) {
    const { rows: currentRows } = await client.query(
      'SELECT label_id FROM task_labels WHERE task_id = $1',
      [taskId],
    );
    const current = currentRows.map((r) => r.label_id).sort();
    const next = [...labelIds].sort();
    if (current.length === next.length && current.every((v, i) => v === next[i])) {
      return;
    }
    await assertLabelsBelong(client, projectId, labelIds);
    await client.query('DELETE FROM task_labels WHERE task_id = $1', [taskId]);
    if (labelIds.length > 0) {
      const values = labelIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(`INSERT INTO task_labels (task_id, label_id) VALUES ${values}`, [
        taskId,
        ...labelIds,
      ]);
    }
    await logActivity(client, { taskId, actorId, action: 'labels_change', field: 'labels' });
  }

  async function logActivity(client, { taskId, actorId, action, field, oldValue, newValue }) {
    await client.query(
      `INSERT INTO task_activity (task_id, actor_id, action, field, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [taskId, actorId, action, field ?? null, oldValue ?? null, newValue ?? null],
    );
  }

  async function listTasks({ projectId, query }) {
    await assertProject(projectId);
    const { page, pageSize } = parsePagination(query);
    const conditions = ['t.project_id = $1', 't.deleted_at IS NULL'];
    const params = [projectId];

    const singleValueFilters = [
      ['status', 't.status'],
      ['priority', 't.priority'],
      ['type', 't.type'],
      ['assigneeId', 't.assignee_id'],
      ['milestoneId', 't.milestone_id'],
      ['parentId', 't.parent_id'],
    ];
    for (const [key, column] of singleValueFilters) {
      const value = query[key];
      if (value !== undefined && value !== '') {
        params.push(value);
        conditions.push(`${column} = $${params.length}`);
      }
    }
    if (query.label !== undefined && query.label !== '') {
      params.push(query.label);
      conditions.push(`EXISTS (SELECT 1 FROM task_labels x WHERE x.task_id = t.id AND x.label_id = $${params.length})`);
    }
    const { sql: searchSql, params: searchParams } = buildSearchClause(query.q, ['t.title']);
    if (searchSql) {
      params.push(...searchParams);
      conditions.push(searchSql.replaceAll('$1', `$${params.length - searchParams.length + 1}`));
    }

    const orderBy = buildOrder(
      query.sort,
      ['t.title', 't.status', 't.priority', 't.position', 't.due_date', 't.created_at', 't.updated_at'],
      't.position ASC, t.created_at ASC',
    );

    const result = await paginate(pool, {
      baseFrom: `tasks t
        LEFT JOIN users u ON u.id = t.assignee_id
        LEFT JOIN task_labels tl ON tl.task_id = t.id
        LEFT JOIN labels l ON l.id = tl.label_id`,
      where: conditions.join(' AND '),
      params,
      orderBy,
      select: 'SELECT t.id, t.project_id, t.milestone_id, t.parent_id, t.type, t.status, t.priority, t.title, t.description, t.assignee_id, t.reporter_id, t.due_date, t.estimate, t.position, t.created_at, t.updated_at, u.name AS assignee_name, u.email AS assignee_email, (SELECT count(*)::int FROM task_comments c WHERE c.task_id = t.id AND c.deleted_at IS NULL) AS comment_count, COALESCE(array_agg(DISTINCT jsonb_build_object(\'id\', l.id, \'name\', l.name, \'color\', l.color)) FILTER (WHERE l.id IS NOT NULL), \'{}\') AS label_ids',
      groupBy: TASK_GROUP,
      countDistinct: 't.id',
      page,
      pageSize,
    });
    return { data: result.data.map(mapTask), meta: result.meta };
  }

  async function createTask({ projectId, userId, input }) {
    await assertProject(projectId);
    await validateReferences(projectId, input);
    const labelIds = input.labels ?? [];
    if (labelIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT id FROM labels WHERE id = ANY($1::uuid[]) AND project_id = $2',
        [labelIds, projectId],
      );
      if (rows.length !== labelIds.length) {
        throw conflict('One or more labels do not belong to this project');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO tasks (project_id, milestone_id, parent_id, type, status, priority, title, description,
                            assignee_id, reporter_id, due_date, estimate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          projectId,
          input.milestoneId ?? null,
          input.parentId ?? null,
          input.type ?? 'task',
          input.status ?? 'todo',
          input.priority ?? 'medium',
          input.title,
          input.description ?? null,
          input.assigneeId ?? null,
          userId,
          input.dueDate ?? null,
          input.estimate ?? null,
        ],
      );
      const task = rows[0];
      await replaceLabels(client, {
        projectId,
        taskId: task.id,
        actorId: userId,
        labelIds,
      });
      await logActivity(client, { taskId: task.id, actorId: userId, action: 'created', field: 'title', newValue: task.title });
      await client.query('COMMIT');
      const full = await getTaskRow(projectId, task.id);
      return { data: mapTask(full) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function getTask({ projectId, taskId }) {
    await assertProject(projectId);
    const row = await getTaskRow(projectId, taskId);
    if (!row) {
      throw notFound('Task not found');
    }
    return { data: mapTask(row) };
  }

  async function updateTask({ projectId, taskId, userId, input }) {
    await assertProject(projectId);
    const current = await getTaskRow(projectId, taskId);
    if (!current) {
      throw notFound('Task not found');
    }
    await validateReferences(projectId, input);

    const fields = [];
    const params = [];
    const changes = [];
    const push = (column, value, { action, field, oldValue } = {}) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
      changes.push({ action, field, oldValue, newValue: value });
    };
    if (input.title !== undefined && input.title !== current.title) push('title', input.title, { action: 'title_change', field: 'title', oldValue: current.title });
    if (input.description !== undefined && input.description !== current.description) push('description', input.description, { action: 'description_change', field: 'description', oldValue: current.description });
    if (input.status !== undefined && input.status !== current.status) push('status', input.status, { action: 'status_change', field: 'status', oldValue: current.status });
    if (input.priority !== undefined && input.priority !== current.priority) push('priority', input.priority, { action: 'priority_change', field: 'priority', oldValue: current.priority });
    if (input.type !== undefined && input.type !== current.type) push('type', input.type, { action: 'type_change', field: 'type', oldValue: current.type });
    if (input.assigneeId !== undefined && input.assigneeId !== current.assignee_id) push('assignee_id', input.assigneeId ?? null, { action: 'assignee_change', field: 'assignee_id', oldValue: current.assignee_id });
    if (input.milestoneId !== undefined && input.milestoneId !== current.milestone_id) push('milestone_id', input.milestoneId ?? null, { action: 'milestone_change', field: 'milestone_id', oldValue: current.milestone_id });
    if (input.dueDate !== undefined && input.dueDate !== current.due_date) push('due_date', input.dueDate ?? null, { action: 'due_date_change', field: 'due_date', oldValue: current.due_date });
    if (input.estimate !== undefined && input.estimate !== current.estimate) push('estimate', input.estimate ?? null, { action: 'estimate_change', field: 'estimate', oldValue: current.estimate });
    if (input.position !== undefined && input.position !== current.position) {
      params.push(input.position);
      fields.push(`position = $${params.length}`);
    }
    if (fields.length === 0 && input.labels === undefined) {
      return { data: mapTask(current) };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (fields.length > 0) {
        params.push(taskId, projectId);
        const { rows } = await client.query(
          `UPDATE tasks SET ${fields.join(', ')}, updated_at = now()
            WHERE id = $${params.length - 1} AND project_id = $${params.length} AND deleted_at IS NULL
            RETURNING *`,
          params,
        );
        if (rows.length === 0) {
          throw notFound('Task not found');
        }
      }
      for (const change of changes) {
        await logActivity(client, { taskId, actorId: userId, ...change });
      }
      if (input.labels !== undefined) {
        await replaceLabels(client, { projectId, taskId, actorId: userId, labelIds: input.labels });
      }
      await client.query('COMMIT');
      const full = await getTaskRow(projectId, taskId);
      return { data: mapTask(full) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function deleteTask({ projectId, taskId }) {
    await assertProject(projectId);
    const { rows } = await pool.query(
      `UPDATE tasks SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [taskId, projectId],
    );
    if (rows.length === 0) {
      throw notFound('Task not found');
    }
    return { ok: true };
  }

  async function getTaskOrThrow(projectId, taskId) {
    await assertProject(projectId);
    const row = await getTaskRow(projectId, taskId);
    if (!row) {
      throw notFound('Task not found');
    }
    return row;
  }

  async function listComments({ projectId, taskId }) {
    await getTaskOrThrow(projectId, taskId);
    const { rows } = await pool.query(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, u.email AS author_email,
              u.avatar_url AS author_avatar_url, c.body, c.created_at, c.updated_at
         FROM task_comments c
         JOIN users u ON u.id = c.author_id
        WHERE c.task_id = $1 AND c.deleted_at IS NULL
        ORDER BY c.created_at ASC`,
      [taskId],
    );
    return {
      data: rows.map((c) => ({
        id: c.id,
        taskId: c.task_id,
        authorId: c.author_id,
        author: { id: c.author_id, name: c.author_name, email: c.author_email, avatarUrl: c.author_avatar_url ?? null },
        body: c.body,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    };
  }

  async function createComment({ projectId, taskId, userId, body }) {
    await getTaskOrThrow(projectId, taskId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO task_comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING *`,
        [taskId, userId, body],
      );
      await logActivity(client, { taskId, actorId: userId, action: 'comment', field: 'body' });
      await client.query('COMMIT');
      const { data } = await listComments({ projectId, taskId });
      return { data: data.find((c) => c.id === rows[0].id) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function canManageTask(userId, projectId) {
    if (!userId) return false;
    const role = await resolveRole({ userId, projectId });
    return Boolean(role) && hasPermission(role, 'tasks.manage');
  }

  async function getCommentOrThrow(projectId, taskId, commentId) {
    const { rows } = await pool.query(
      `SELECT * FROM task_comments
        WHERE id = $1 AND task_id = $2 AND deleted_at IS NULL`,
      [commentId, taskId],
    );
    if (rows.length === 0) {
      throw notFound('Comment not found');
    }
    return rows[0];
  }

  async function updateComment({ projectId, taskId, commentId, userId, body }) {
    const comment = await getCommentOrThrow(projectId, taskId, commentId);
    const manage = await canManageTask(userId, projectId);
    if (comment.author_id !== userId && !manage) {
      throw forbidden('Only the author or a project manager can edit this comment');
    }
    const { rows } = await pool.query(
      `UPDATE task_comments SET body = $1, updated_at = now()
        WHERE id = $2 RETURNING *`,
      [body, commentId],
    );
    return { data: { id: rows[0].id, body: rows[0].body, updatedAt: rows[0].updated_at } };
  }

  async function deleteComment({ projectId, taskId, commentId, userId }) {
    const comment = await getCommentOrThrow(projectId, taskId, commentId);
    const manage = await canManageTask(userId, projectId);
    if (comment.author_id !== userId && !manage) {
      throw forbidden('Only the author or a project manager can delete this comment');
    }
    await pool.query(
      `UPDATE task_comments SET deleted_at = now(), updated_at = now()
        WHERE id = $1`,
      [commentId],
    );
    return { ok: true };
  }

  async function setLabels({ projectId, taskId, userId, labelIds }) {
    await getTaskOrThrow(projectId, taskId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await replaceLabels(client, { projectId, taskId, actorId: userId, labelIds });
      await client.query('COMMIT');
      const row = await getTaskRow(projectId, taskId);
      return { data: { labels: buildLabels(row) } };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function listActivity({ projectId, taskId }) {
    await getTaskOrThrow(projectId, taskId);
    const { rows } = await pool.query(
      `SELECT a.id, a.task_id, a.actor_id, u.name AS actor_name, a.action, a.field,
              a.old_value, a.new_value, a.created_at
         FROM task_activity a
         JOIN users u ON u.id = a.actor_id
        WHERE a.task_id = $1
        ORDER BY a.created_at DESC
        LIMIT 200`,
      [taskId],
    );
    return {
      data: rows.map((a) => ({
        id: a.id,
        taskId: a.task_id,
        actorId: a.actor_id,
        actor: { id: a.actor_id, name: a.actor_name },
        action: a.action,
        field: a.field ?? null,
        oldValue: a.old_value ?? null,
        newValue: a.new_value ?? null,
        createdAt: a.created_at,
      })),
    };
  }

  async function listDependencies({ projectId, taskId }) {
    await getTaskOrThrow(projectId, taskId);
    const { rows: blockingRows } = await pool.query(
      `SELECT d.depends_on_id, t.title, t.status, t.type
         FROM task_dependencies d
         JOIN tasks t ON t.id = d.depends_on_id AND t.deleted_at IS NULL
        WHERE d.task_id = $1
        ORDER BY t.created_at ASC`,
      [taskId],
    );
    const { rows: blockedRows } = await pool.query(
      `SELECT d.task_id, t.title, t.status, t.type
         FROM task_dependencies d
         JOIN tasks t ON t.id = d.task_id AND t.deleted_at IS NULL
        WHERE d.depends_on_id = $1
        ORDER BY t.created_at ASC`,
      [taskId],
    );
    const map = (rows, key) =>
      rows.map((r) => ({ taskId: r[key], title: r.title, status: r.status, type: r.type }));
    return {
      data: {
        dependsOn: map(blockingRows, 'depends_on_id'),
        dependedOnBy: map(blockedRows, 'task_id'),
      },
    };
  }

  async function assertNoCycle(projectId, taskId, dependsOnId) {
    const { rows } = await pool.query(
      `SELECT d.task_id, d.depends_on_id
         FROM task_dependencies d
         JOIN tasks t ON t.id = d.task_id AND t.deleted_at IS NULL
        WHERE t.project_id = $1`,
      [projectId],
    );
    const graph = new Map();
    for (const row of rows) {
      if (!graph.has(row.task_id)) {
        graph.set(row.task_id, []);
      }
      graph.get(row.task_id).push(row.depends_on_id);
    }
    const queue = [dependsOnId];
    const seen = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === taskId) {
        throw conflict('Adding this dependency would create a cycle');
      }
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      for (const next of graph.get(current) ?? []) {
        queue.push(next);
      }
    }
  }

  async function createDependency({ projectId, taskId, userId, dependsOnId }) {
    await getTaskOrThrow(projectId, taskId);
    if (dependsOnId === taskId) {
      throw conflict('A task cannot depend on itself');
    }
    const { rows: targetRows } = await pool.query(
      'SELECT 1 FROM tasks WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL',
      [dependsOnId, projectId],
    );
    if (targetRows.length === 0) {
      throw conflict('Dependency task does not belong to this project');
    }
    const { rows: existingRows } = await pool.query(
      'SELECT 1 FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2',
      [taskId, dependsOnId],
    );
    if (existingRows.length > 0) {
      return { data: { taskId, dependsOnId } };
    }
    await assertNoCycle(projectId, taskId, dependsOnId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ($1, $2)',
        [taskId, dependsOnId],
      );
      await logActivity(client, { taskId, actorId: userId, action: 'dependency_added', field: 'depends_on_id', newValue: dependsOnId });
      await client.query('COMMIT');
      return { data: { taskId, dependsOnId } };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function deleteDependency({ projectId, taskId, userId, dependsOnId }) {
    await getTaskOrThrow(projectId, taskId);
    const { rows } = await pool.query(
      'DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2 RETURNING *',
      [taskId, dependsOnId],
    );
    if (rows.length === 0) {
      throw notFound('Dependency not found');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await logActivity(client, { taskId, actorId: userId, action: 'dependency_removed', field: 'depends_on_id', oldValue: dependsOnId });
      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    listTasks,
    createTask,
    getTask,
    updateTask,
    deleteTask,
    listComments,
    createComment,
    updateComment,
    deleteComment,
    setLabels,
    listActivity,
    listDependencies,
    createDependency,
    deleteDependency,
  };
}
