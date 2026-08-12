export const DEFAULT_COLUMNS = ['todo', 'in_progress', 'done'];

export function byPosition(a, b) {
  return a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt));
}

// Given the board columns, compute where a dragged task lands: the target
// { status, position }. `beforeId` is the task the dragged task is dropped
// immediately before inside the target column; omit it to append to the end.
export function computeDrop(columns, { draggedId, column, beforeId }) {
  const target = columns.find((c) => c.name === column);
  if (!target) {
    return null;
  }

  const order = [...target.tasks].sort(byPosition);
  const dragged = columns.flatMap((c) => c.tasks).find((t) => t.id === draggedId);

  let position;
  if (beforeId !== undefined) {
    const beforeIndex = order.findIndex((t) => t.id === beforeId);
    const before = beforeIndex > 0 ? order[beforeIndex - 1] : null;
    const after = beforeIndex >= 0 ? order[beforeIndex] : null;
    if (before && after) {
      position = (before.position + after.position) / 2;
    } else if (after) {
      position = after.position - 1;
    } else if (before) {
      position = before.position + 1;
    } else {
      position = 1;
    }
  } else {
    const last = order[order.length - 1];
    position = last ? last.position + 1 : 1;
  }

  return { status: column, position, sameColumn: dragged?.status === column };
}
