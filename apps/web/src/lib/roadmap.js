import { byPosition } from './board.js';

const STATUS_ORDER = ['planned', 'active', 'done'];

function compareMilestones(a, b) {
  const aOrder = STATUS_ORDER.indexOf(a.milestone.status);
  const bOrder = STATUS_ORDER.indexOf(b.milestone.status);
  const statusDiff = (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
  if (statusDiff !== 0) {
    return statusDiff;
  }
  const aDate = a.milestone.dueDate ?? '9999-12-31';
  const bDate = b.milestone.dueDate ?? '9999-12-31';
  return aDate.localeCompare(bDate);
}

// Groups tasks by milestone (ordered by status then due date) and collects
// tasks without a milestone into a backlog group.
export function buildRoadmap(tasks, milestones) {
  const byMilestone = new Map();
  const backlog = [];
  for (const task of tasks) {
    if (task.milestoneId == null) {
      backlog.push(task);
      continue;
    }
    if (!byMilestone.has(task.milestoneId)) {
      byMilestone.set(task.milestoneId, []);
    }
    byMilestone.get(task.milestoneId).push(task);
  }

  const groups = milestones
    .map((milestone) => ({
      milestone,
      tasks: (byMilestone.get(milestone.id) ?? []).sort(byPosition),
    }))
    .sort(compareMilestones);

  return { groups, backlog: backlog.sort(byPosition) };
}
