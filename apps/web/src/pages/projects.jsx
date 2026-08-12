import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useWorkspaceStore } from '../stores/workspace.js';
import { ErrorBanner, Field, buttonClass, ghostButtonClass, inputClass } from '../components/form.jsx';

const priorityTone = {
  low: 'text-muted',
  medium: 'text-sky-400',
  high: 'text-amber-400',
  urgent: 'text-red-400',
};

export function Projects() {
  const queryClient = useQueryClient();
  const orgId = useWorkspaceStore((s) => s.orgId);

  const projectsQuery = useQuery({
    queryKey: ['organizations', orgId, 'projects'],
    queryFn: () => api.listProjects(orgId, { pageSize: 100 }),
    enabled: Boolean(orgId),
  });

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [defaultPriority, setDefaultPriority] = useState('medium');
  const [error, setError] = useState(null);

  const createMutation = useMutation({
    mutationFn: (payload) => api.createProject(orgId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects'] });
      setShowNew(false);
      setName('');
      setKey('');
      setDefaultPriority('medium');
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (projectId) => api.deleteProject(orgId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'projects'] });
    },
    onError: (err) => setError(err.message),
  });

  function onCreate(event) {
    event.preventDefault();
    createMutation.mutate({ name, key, defaultPriority });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted">Plan work, milestones and boards.</p>
        </div>
        <button type="button" onClick={() => setShowNew((v) => !v)} className={buttonClass}>
          {showNew ? 'Cancel' : 'New project'}
        </button>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {showNew ? (
        <form onSubmit={onCreate} className="space-y-4 rounded-lg border border-line bg-panel p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My project"
                required
              />
            </Field>
            <Field label="Key">
              <input
                className={`${inputClass} uppercase`}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="ABC"
                maxLength={6}
                required
              />
            </Field>
            <Field label="Default priority">
              <select
                className={inputClass}
                value={defaultPriority}
                onChange={(e) => setDefaultPriority(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>
          <button type="submit" disabled={createMutation.isPending} className={buttonClass}>
            {createMutation.isPending ? 'Creating…' : 'Create project'}
          </button>
        </form>
      ) : null}

      {!orgId ? (
        <p className="text-sm text-muted">You are not part of an organization yet.</p>
      ) : projectsQuery.isPending ? (
        <p className="text-sm text-muted">Loading projects…</p>
      ) : projectsQuery.isError ? (
        <ErrorBanner>{projectsQuery.error.message}</ErrorBanner>
      ) : projectsQuery.data.length === 0 ? (
        <p className="text-sm text-muted">No projects yet — create one to get started.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projectsQuery.data.map((project) => (
            <div
              key={project.id}
              className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {project.key}
                </span>
                <span
                  className={`text-[11px] font-medium ${project.status === 'archived' ? 'text-red-400' : 'text-muted'}`}
                >
                  {project.status}
                </span>
              </div>
              <Link to={`/projects/${project.id}`} className="text-sm font-medium text-ink hover:text-accent">
                {project.name}
              </Link>
              {project.description ? (
                <p className="line-clamp-2 text-xs text-muted">{project.description}</p>
              ) : null}
              <div className="mt-auto flex items-center justify-between text-[11px] text-muted">
                <span>
                  {project.taskCount} tasks · {project.memberCount} members
                </span>
                <span className={priorityTone[project.defaultPriority] ?? 'text-muted'}>
                  {project.defaultPriority}
                </span>
              </div>
              {project.status !== 'archived' ? (
                <button
                  type="button"
                  onClick={() => archiveMutation.mutate(project.id)}
                  className={`${ghostButtonClass} self-end`}
                >
                  Archive
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
