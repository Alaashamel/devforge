import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { ErrorBanner, Field, buttonClass, ghostButtonClass, inputClass } from '../components/form.jsx';
import { useRealtime } from '../hooks/use-realtime.js';

const priorityTone = {
  low: 'text-muted',
  medium: 'text-sky-400',
  high: 'text-amber-400',
  urgent: 'text-red-400',
};

export function TaskDetail() {
  const { projectId, taskId } = useParams();
  const queryClient = useQueryClient();
  const orgId = useWorkspaceStore((s) => s.orgId);

  const taskQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId],
    queryFn: () => api.getTask(orgId, projectId, taskId),
    enabled: Boolean(orgId),
  });
  const projectQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId],
    queryFn: () => api.getProject(orgId, projectId),
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
  const tasksQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'tasks'],
    queryFn: () => api.listTasks(orgId, projectId, { pageSize: 100 }),
    enabled: Boolean(orgId),
  });
  const commentsQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'comments'],
    queryFn: () => api.listTaskComments(orgId, projectId, taskId),
    enabled: Boolean(orgId),
  });
  const activityQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'],
    queryFn: () => api.listTaskActivity(orgId, projectId, taskId),
    enabled: Boolean(orgId),
  });
  const dependenciesQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'dependencies'],
    queryFn: () => api.listDependencies(orgId, projectId, taskId),
    enabled: Boolean(orgId),
  });

  useRealtime({
    rooms: projectId && taskId ? [`task:${taskId}`, `project:${projectId}`] : [],
    on: {
      'task:updated': () => {
        queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks'] });
        queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId] });
        queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'] });
      },
      'task:comment': () => {
        queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'comments'] });
        queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'] });
      },
    },
  });

  const [error, setError] = useState(null);
  const [comment, setComment] = useState('');
  const [dependsOnId, setDependsOnId] = useState('');

  const task = taskQuery.data;
  const milestones = milestonesQuery.data ?? [];
  const labels = labelsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const tasks = (tasksQuery.data ?? []).filter((t) => t.id !== taskId);

  const [form, setForm] = useState(null);
  const openForm = form || (task && {
    title: task.title,
    status: task.status,
    priority: task.priority,
    type: task.type,
    assigneeId: task.assigneeId ?? '',
    milestoneId: task.milestoneId ?? '',
    dueDate: task.dueDate ?? '',
    description: task.description ?? '',
  });

  const updateMutation = useMutation({
    mutationFn: (payload) => api.updateTask(orgId, projectId, taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'] });
      setForm(null);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const labelMutation = useMutation({
    mutationFn: (labelIds) => api.setTaskLabels(orgId, projectId, taskId, { labelIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'] });
    },
    onError: (err) => setError(err.message),
  });

  const commentMutation = useMutation({
    mutationFn: (body) => api.addTaskComment(orgId, projectId, taskId, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'] });
      setComment('');
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const depMutation = useMutation({
    mutationFn: (payload) => api.addDependency(orgId, projectId, taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'] });
      setDependsOnId('');
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const depRemoveMutation = useMutation({
    mutationFn: (id) => api.removeDependency(orgId, projectId, taskId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects', projectId, 'tasks', taskId, 'activity'] });
    },
    onError: (err) => setError(err.message),
  });

  function toggleLabel(labelId) {
    const current = (task.labels ?? []).map((l) => l.id);
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId];
    labelMutation.mutate(next);
  }

  if (taskQuery.isPending) {
    return <p className="text-sm text-muted">Loading task…</p>;
  }
  if (taskQuery.isError) {
    return <ErrorBanner>{taskQuery.error.message}</ErrorBanner>;
  }

  function onSave(event) {
    event.preventDefault();
    const payload = {
      title: openForm.title,
      status: openForm.status,
      priority: openForm.priority,
      type: openForm.type,
      assigneeId: openForm.assigneeId || null,
      milestoneId: openForm.milestoneId || null,
      dueDate: openForm.dueDate || null,
      description: openForm.description || null,
    };
    updateMutation.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/projects/${projectId}`} className="text-xs text-muted hover:text-ink">
          ← {projectQuery.data?.name ?? 'Project'}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{task.title}</h1>
          <span className={`text-[11px] font-medium ${priorityTone[task.priority] ?? 'text-muted'}`}>
            {task.priority}
          </span>
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
            {task.type}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Status: {task.status}</span>
          <span>· Reporter: {task.reporterId ? 'you' : '—'}</span>
          <span>· Assignee: {task.assignee ? task.assignee.name : 'unassigned'}</span>
          {task.dueDate ? <span>· Due {task.dueDate}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {labels.map((label) => {
            const active = (task.labels ?? []).some((l) => l.id === label.id);
            return (
              <button
                key={label.id}
                type="button"
                onClick={() => toggleLabel(label.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  active ? 'text-canvas' : 'border-line text-muted hover:bg-panel hover:text-ink'
                }`}
                style={active ? { backgroundColor: label.color } : undefined}
              >
                {label.name}
              </button>
            );
          })}
        </div>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Details</h2>
              <button type="button" onClick={() => setForm(openForm)} className={ghostButtonClass}>
                {form ? 'Editing' : 'Edit'}
              </button>
            </div>
            {task.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted">{task.description}</p>
            ) : (
              <p className="text-sm text-muted">No description.</p>
            )}
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Comments</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commentMutation.mutate(comment);
              }}
              className="flex gap-2"
            >
              <input
                className={inputClass}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…"
              />
              <button type="submit" className={ghostButtonClass} disabled={!comment.trim()}>
                Post
              </button>
            </form>
            <ul className="mt-4 space-y-3">
              {(commentsQuery.data ?? []).map((c) => (
                <li key={c.id} className="border-t border-line pt-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="font-medium text-ink">{c.author?.name ?? 'Unknown'}</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
              {(commentsQuery.data ?? []).length === 0 ? (
                <li className="text-xs text-muted">No comments yet.</li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Activity</h2>
            <ul className="space-y-2 text-xs text-muted">
              {(activityQuery.data ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 border-t border-line pt-2">
                  <span>
                    <span className="font-medium text-ink">{a.actor?.name ?? 'Unknown'}</span>{' '}
                    {a.action.replaceAll('_', ' ')}
                    {a.field ? ` on ${a.field}` : ''}
                    {a.newValue ? ` → ${a.newValue}` : ''}
                  </span>
                  <span className="shrink-0">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
              {(activityQuery.data ?? []).length === 0 ? (
                <li>No activity recorded.</li>
              ) : null}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Edit task</h2>
            {form === null ? (
              <p className="text-xs text-muted">Click Edit to change task fields.</p>
            ) : (
              <form onSubmit={onSave} className="space-y-3">
                <Field label="Title">
                  <input
                    className={inputClass}
                    value={openForm.title}
                    onChange={(e) => setForm({ ...openForm, title: e.target.value })}
                    required
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <select
                      className={inputClass}
                      value={openForm.status}
                      onChange={(e) => setForm({ ...openForm, status: e.target.value })}
                    >
                      {['todo', 'in_progress', 'done'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select
                      className={inputClass}
                      value={openForm.priority}
                      onChange={(e) => setForm({ ...openForm, priority: e.target.value })}
                    >
                      {['low', 'medium', 'high', 'urgent'].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Type">
                    <select
                      className={inputClass}
                      value={openForm.type}
                      onChange={(e) => setForm({ ...openForm, type: e.target.value })}
                    >
                      {['task', 'issue', 'bug'].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Due date">
                    <input
                      type="date"
                      className={inputClass}
                      value={openForm.dueDate}
                      onChange={(e) => setForm({ ...openForm, dueDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Assignee">
                    <select
                      className={inputClass}
                      value={openForm.assigneeId}
                      onChange={(e) => setForm({ ...openForm, assigneeId: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Milestone">
                    <select
                      className={inputClass}
                      value={openForm.milestoneId}
                      onChange={(e) => setForm({ ...openForm, milestoneId: e.target.value })}
                    >
                      <option value="">None</option>
                      {milestones.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={openForm.description}
                    onChange={(e) => setForm({ ...openForm, description: e.target.value })}
                  />
                </Field>
                <button type="submit" disabled={updateMutation.isPending} className={buttonClass}>
                  {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </form>
            )}
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Dependencies</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                depMutation.mutate({ dependsOnId });
              }}
              className="flex gap-2"
            >
              <select className={inputClass} value={dependsOnId} onChange={(e) => setDependsOnId(e.target.value)}>
                <option value="">Select task…</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button type="submit" className={ghostButtonClass} disabled={!dependsOnId}>
                Add
              </button>
            </form>
            <ul className="mt-3 space-y-2 text-sm">
              {(dependenciesQuery.data?.dependsOn ?? []).map((d) => (
                <li key={d.taskId} className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <span className="text-ink">{d.title}</span>
                  <button
                    type="button"
                    onClick={() => depRemoveMutation.mutate(d.taskId)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {(dependenciesQuery.data?.dependsOn ?? []).length === 0 ? (
                <li className="text-xs text-muted">Nothing blocks this task.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
