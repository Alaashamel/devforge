import { describe, it, expect } from 'vitest';
import { computeDrop } from '../lib/board.js';
import { buildRoadmap } from '../lib/roadmap.js';

const task = (id, status, position, createdAt = '2026-01-01T00:00:00Z', extra = {}) => ({
  id,
  status,
  position,
  createdAt,
  ...extra,
});

function columns(tasks) {
  const names = ['todo', 'in_progress', 'done'];
  return names.map((name) => ({
    name,
    tasks: tasks.filter((t) => t.status === name),
  }));
}

describe('computeDrop', () => {
  const board = columns([
    task('a', 'todo', 1),
    task('b', 'todo', 2),
    task('c', 'in_progress', 5),
  ]);

  it('appends to the end of an empty column', () => {
    expect(computeDrop(board, { draggedId: 'a', column: 'done' })).toEqual({
      status: 'done',
      position: 1,
      sameColumn: false,
    });
  });

  it('appends after the last task of a column', () => {
    expect(computeDrop(board, { draggedId: 'a', column: 'in_progress' })).toEqual({
      status: 'in_progress',
      position: 6,
      sameColumn: false,
    });
  });

  it('inserts before a task using the midpoint of its neighbors', () => {
    expect(computeDrop(board, { draggedId: 'a', column: 'todo', beforeId: 'b' })).toEqual({
      status: 'todo',
      position: 1.5,
      sameColumn: true,
    });
  });

  it('inserts at the front when there is no preceding task', () => {
    expect(computeDrop(board, { draggedId: 'c', column: 'todo', beforeId: 'a' })).toEqual({
      status: 'todo',
      position: 0,
      sameColumn: false,
    });
  });

  it('returns null for an unknown column', () => {
    expect(computeDrop(board, { draggedId: 'a', column: 'nope' })).toBeNull();
  });
});

describe('buildRoadmap', () => {
  const milestones = [
    { id: 'm1', title: 'Beta', status: 'planned', dueDate: '2026-09-01' },
    { id: 'm2', title: 'Alpha', status: 'active', dueDate: '2026-08-01' },
    { id: 'm3', title: 'Shipped', status: 'done', dueDate: '2026-07-01' },
  ];
  const tasks = [
    task('t1', 'todo', 1, '2026-01-01T00:00:00Z', { milestoneId: 'm2' }),
    task('t2', 'in_progress', 2, '2026-01-01T00:00:00Z', { milestoneId: 'm1' }),
    task('t3', 'done', 0, '2026-01-01T00:00:00Z', { milestoneId: 'm2' }),
    task('t4', 'todo', 9, '2026-01-01T00:00:00Z', { milestoneId: null }),
  ];

  it('groups tasks by milestone ordered by status then due date', () => {
    const { groups } = buildRoadmap(tasks, milestones);
    expect(groups.map((g) => g.milestone.id)).toEqual(['m1', 'm2', 'm3']);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['t3', 't1']);
  });

  it('collects tasks without a milestone into the backlog', () => {
    const { backlog } = buildRoadmap(tasks, milestones);
    expect(backlog.map((t) => t.id)).toEqual(['t4']);
  });
});
