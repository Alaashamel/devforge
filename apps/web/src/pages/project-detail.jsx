import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { ErrorBanner, Field, buttonClass, ghostButtonClass, inputClass } from '../components/form.jsx';
import { StatusPill } from '../components/status-pill.jsx';
import { DEFAULT_COLUMNS, computeDrop } from '../lib/board.js';
import { buildRoadmap } from '../lib/roadmap.js';
import { useRealtime } from '../hooks/use-realtime.js';

const priorityTone = {
  low: 'bg-muted',
  medium: 'bg-sky-400',
  high: 'bg-amber-400',
  urgent: 'bg-red-400',
};

function TaskCard({ projectId, task, milestones, onDragStart, onDragEnd, onDragOver, onDrop, isDragging }) {
  const milestone = milestones.find((m) => m.id === task.milestoneId);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-md border border-line bg-canvas p-3 transition-opacity hover:border-accent/50 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Link to={`/projects/${projectId}/tasks/${task.id}`} className="text-sm text-ink hover:text-accent">
          {task.title}
        </Link>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityTone[task.priority] ?? 'bg-muted'}`} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.labels?.map((label) => (
          <span
            key={label.id}
            className="rounded px-1.5 py-0.5 text-[10px] text-canvas"
            style={{ backgroundColor: label.color }}
          >
            {label.name}
          </span>
        ))}
        {milestone ? (
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
            {milestone.title}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
        <span>{task.assignee ? task.assignee.name : 'Unassigned'}</span>
        <span>{task.commentCount} comments</span>
      </div>
    </div>
  );
}

export function ProjectDetail() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const orgId = useWorkspaceStore((s) => s.orgId);

  const taskKeys = ['organizations', orgId, 'projects', projectId, 'tasks'];
  const projectKeys = ['organizations', orgId, 'projects', projectId];

  const projectQuery = useQuery({
    queryKey: projectKeys,
    queryFn: () => api.getProject(orgId, projectId),
    enabled: Boolean(orgId),
  });
  const tasksQuery = useQuery({
    queryKey: taskKeys,
    queryFn: () => api.listTasks(orgId, projectId, { pageSize: 100 }),
    enabled: Boolean(orgId),
  });
  const milestonesQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'milestones'],
    queryFn: () => api.listMilestones(orgId, projectId),
    enabled: Boolean(orgId),
  });
  const labelsQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'labels'],
    queryFn: () => api.listLabels(orgId, projectId),
    enabled: Boolean(orgId),
  });
  const membersQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'members'],
    queryFn: () => api.listProjectMembers(orgId, projectId),
    enabled: Boolean(orgId),
  });

  useRealtime({
    rooms: projectId ? [`project:${projectId}`] : [],
    on: {
      'task:created': () => {
        queryClient.invalidateQueries({ queryKey: taskKeys });
        queryClient.invalidateQueries({ queryKey: projectKeys });
      },
      'task:updated': () => {
        queryClient.invalidateQueries({ queryKey: taskKeys });
        queryClient.invalidateQueries({ queryKey: projectKeys });
      },
    },
  });

  const [error, setError] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [view, setView] = useState('board');
  const [draggedId, setDraggedId] = useState(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');

  const createTaskMutation = useMutation({
    mutationFn: (payload) => api.createTask(orgId, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys });
      queryClient.invalidateQueries({ queryKey: projectKeys });
      setQuickOpen(false);
      setTitle('');
      setStatus('todo');
      setPriority('medium');
      setAssigneeId('');
      setMilestoneId('');
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const milestoneMutation = useMutation({
    mutationFn: (payload) => api.createMilestone(orgId, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'milestones'] });
    },
    onError: (err) => setError(err.message),
  });

  const labelMutation = useMutation({
    mutationFn: (payload) => api.createLabel(orgId, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'labels'] });
    },
    onError: (err) => setError(err.message),
  });

  const moveMutation = useMutation({
    mutationFn: ({ taskId, status: nextStatus, position }) =>
      api.updateTask(orgId, projectId, taskId, { status: nextStatus, position }),
    onMutate: async ({ taskId, status: nextStatus, position }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys });
      const previous = queryClient.getQueryData(taskKeys);
      queryClient.setQueryData(taskKeys, (tasks) =>
        (tasks ?? []).map((t) => (t.id === taskId ? { ...t, status: nextStatus, position } : t)),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys, context.previous);
      }
      setError(err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys });
      queryClient.invalidateQueries({ queryKey: projectKeys });
    },
  });

  const [newMilestone, setNewMilestone] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const columns = (() => {
    const order = [...DEFAULT_COLUMNS];
    const data = tasksQuery.data ?? [];
    for (const task of data) {
      if (!order.includes(task.status)) order.push(task.status);
    }
    return order.map((name) => ({
      name,
      tasks: data.filter((t) => t.status === name),
    }));
  })();

  function dropOnColumn(columnName, beforeId) {
    if (!draggedId) return;
    const dragged = columns.flatMap((c) => c.tasks).find((t) => t.id === draggedId);
    const drop = computeDrop(columns, { draggedId, column: columnName, beforeId });
    const noop = drop && dragged && drop.sameColumn && drop.position === dragged.position;
    if (drop && !noop) {
      moveMutation.mutate({ taskId: draggedId, ...drop });
    }
    setDraggedId(null);
  }

  const project = projectQuery.data;
  const milestones = milestonesQuery.data ?? [];
  const labels = labelsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const roadmap = buildRoadmap(tasksQuery.data ?? [], milestones);

  function onCreateTask(event) {
    event.preventDefault();
    createTaskMutation.mutate({
      title,
      status,
      priority,
      assigneeId: assigneeId || null,
      milestoneId: milestoneId || null,
    });
  }

  if (projectQuery.isPending) {
    return <p className="text-sm text-muted">Loading project…</p>;
  }
  if (projectQuery.isError) {
    return <ErrorBanner>{projectQuery.error.message}</ErrorBanner>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="text-xs text-muted hover:text-ink">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
            {project.key}
          </span>
          <StatusPill label={project.status} tone={project.status === 'archived' ? 'danger' : 'good'} />
        </div>
        {project.description ? (
          <p className="mt-1 text-sm text-muted">{project.description}</p>
        ) : null}
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <StatusPill label={`${project.taskCount} tasks`} tone="neutral" />
        <StatusPill label={`${project.memberCount} members`} tone="neutral" />
        {Object.entries(project.taskCounts?.byStatus ?? {}).map(([key, count]) => (
          <StatusPill key={key} label={`${key}: ${count}`} tone="neutral" />
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {['board', 'roadmap'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md border px-3 py-1.5 text-xs capitalize ${
                  view === v
                    ? 'border-accent bg-accent text-canvas'
                    : 'border-line text-muted hover:bg-panel hover:text-ink'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {view === 'board' ? (
            <button type="button" onClick={() => setQuickOpen((v) => !v)} className={ghostButtonClass}>
              {quickOpen ? 'Close' : 'Quick add task'}
            </button>
          ) : null}
        </div>

        {view === 'board' ? (
          <>
            {quickOpen ? (
              <form onSubmit={onCreateTask} className="grid gap-3 rounded-lg border border-line bg-panel p-4 sm:grid-cols-5">
                <div className="sm:col-span-2">
                  <Field label="Title">
                    <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </Field>
                </div>
                <Field label="Status">
                  <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="todo">todo</option>
                    <option value="in_progress">in_progress</option>
                    <option value="done">done</option>
                  </select>
                </Field>
                <Field label="Priority">
                  <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="urgent">urgent</option>
                  </select>
                </Field>
                <div className="flex items-end">
                  <button type="submit" disabled={createTaskMutation.isPending} className={buttonClass}>
                    {createTaskMutation.isPending ? 'Adding…' : 'Add'}
                  </button>
                </div>
                <Field label="Assignee">
                  <select className={inputClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Milestone">
                  <select className={inputClass} value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
                    <option value="">None</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </form>
            ) : null}

            {tasksQuery.isPending ? (
              <p className="text-sm text-muted">Loading tasks…</p>
            ) : tasksQuery.isError ? (
              <ErrorBanner>{tasksQuery.error.message}</ErrorBanner>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {columns.map((column) => (
                  <div
                    key={column.name}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOnColumn(column.name, undefined)}
                    className="rounded-lg border border-line bg-panel p-3"
                  >
                    <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted">
                      <span>{column.name}</span>
                      <span>{column.tasks.length}</span>
                    </div>
                    <div className="space-y-2">
                      {column.tasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          projectId={projectId}
                          task={task}
                          milestones={milestones}
                          isDragging={draggedId === task.id}
                          onDragStart={() => setDraggedId(task.id)}
                          onDragEnd={() => setDraggedId(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            dropOnColumn(column.name, task.id);
                          }}
                        />
                      ))}
                      {column.tasks.length === 0 ? (
                        <p className="text-xs text-muted">No tasks.</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {roadmap.groups.map((group) => (
              <section key={group.milestone.id} className="rounded-lg border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{group.milestone.title}</h3>
                  <div className="flex items-center gap-2">
                    <StatusPill label={group.milestone.status} tone={group.milestone.status === 'done' ? 'good' : 'neutral'} />
                    {group.milestone.dueDate ? (
                      <span className="text-xs text-muted">due {group.milestone.dueDate}</span>
                    ) : null}
                    <span className="text-xs text-muted">{group.tasks.length} tasks</span>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {group.tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityTone[t.priority] ?? 'bg-muted'}`} />
                      <Link to={`/projects/${projectId}/tasks/${t.id}`} className="text-ink hover:text-accent">
                        {t.title}
                      </Link>
                      <span className="ml-auto text-xs text-muted">{t.status}</span>
                      <span className="text-xs text-muted">{t.assignee ? t.assignee.name : 'Unassigned'}</span>
                    </li>
                  ))}
                  {group.tasks.length === 0 ? (
                    <li className="text-xs text-muted">No tasks in this milestone.</li>
                  ) : null}
                </ul>
              </section>
            ))}
            <section className="rounded-lg border border-dashed border-line p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Backlog</h3>
                <span className="text-xs text-muted">{roadmap.backlog.length} tasks</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {roadmap.backlog.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityTone[t.priority] ?? 'bg-muted'}`} />
                    <Link to={`/projects/${projectId}/tasks/${t.id}`} className="text-ink hover:text-accent">
                      {t.title}
                    </Link>
                    <span className="ml-auto text-xs text-muted">{t.status}</span>
                    <span className="text-xs text-muted">{t.assignee ? t.assignee.name : 'Unassigned'}</span>
                  </li>
                ))}
                {roadmap.backlog.length === 0 ? (
                  <li className="text-xs text-muted">All tasks are in a milestone.</li>
                ) : null}
              </ul>
            </section>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold">Milestones</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              milestoneMutation.mutate({ title: newMilestone, status: 'planned' });
              setNewMilestone('');
            }}
            className="flex gap-2"
          >
            <input
              className={inputClass}
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              placeholder="New milestone"
            />
            <button type="submit" className={ghostButtonClass} disabled={!newMilestone.trim()}>
              Add
            </button>
          </form>
          <ul className="space-y-2 text-sm">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-ink">{m.title}</span>
                  {m.dueDate ? <span className="ml-2 text-xs text-muted">{m.dueDate}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">{m.taskCount} tasks</span>
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
                    {m.status}
                  </span>
                </div>
              </li>
            ))}
            {milestones.length === 0 ? <li className="text-xs text-muted">No milestones.</li> : null}
          </ul>
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold">Labels</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              labelMutation.mutate({ name: newLabel });
              setNewLabel('');
            }}
            className="flex gap-2"
          >
            <input
              className={inputClass}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New label"
            />
            <button type="submit" className={ghostButtonClass} disabled={!newLabel.trim()}>
              Add
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-canvas"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
                <span className="opacity-75">{label.taskCount}</span>
              </span>
            ))}
            {labels.length === 0 ? <p className="text-xs text-muted">No labels.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
