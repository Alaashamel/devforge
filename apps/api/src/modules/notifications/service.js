import { notFound } from '../../utils/errors.js';

function mapNotification(r) {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body ?? null,
    href: r.href ?? null,
    readAt: r.read_at ?? null,
    createdAt: r.created_at,
  };
}

/**
 * Persisted per-user notifications. The `notify` function is the only way
 * notifications are created; every other module calls it and it broadcasts a
 * `notification:new` event on the user's socket room so open clients update
 * instantly without polling.
 */
export function createNotificationService({ pool, realtime }) {
  async function list({ userId, limit = 50, unreadOnly = false }) {
    const numLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const conditions = ['user_id = $1'];
    const params = [userId];
    if (unreadOnly) {
      conditions.push('read_at IS NULL');
    }
    const { rows } = await pool.query(
      `SELECT id, user_id, type, title, body, href, read_at, created_at
         FROM notifications
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${numLimit}`,
      params,
    );
    return { data: rows.map(mapNotification) };
  }

  async function unreadCount({ userId }) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count
         FROM notifications
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return { data: { count: rows[0].count } };
  }

  async function markRead({ userId, id }) {
    const { rows } = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [id, userId],
    );
    if (rows.length === 0) {
      throw notFound('Notification not found');
    }
    return { data: mapNotification(rows[0]) };
  }

  async function markAllRead({ userId }) {
    await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return { ok: true };
  }

  async function notify({ userId, type, title, body, href }) {
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, href)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, title, body ?? null, href ?? null],
    );
    const notification = mapNotification(rows[0]);
    realtime?.emitToUser?.(userId, 'notification:new', { notification });
    return notification;
  }

  return { list, unreadCount, markRead, markAllRead, notify };
}
