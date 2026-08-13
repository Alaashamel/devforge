function mapMessage(r) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    authorId: r.author_id,
    author: r.author_name
      ? { id: r.author_id, name: r.author_name, avatarUrl: r.author_avatar_url ?? null }
      : null,
    body: r.body,
    createdAt: r.created_at,
  };
}

const MESSAGE_SELECT = `
  SELECT m.id, m.organization_id, m.author_id, m.body, m.created_at,
         u.name AS author_name, u.avatar_url AS author_avatar_url
    FROM chat_messages m
    JOIN users u ON u.id = m.author_id`;

/**
 * Organization-wide team chat. Messages are persisted and broadcast to the
 * `chat:{orgId}` room; typing indicators are delivered over the socket as
 * throttled `chat:typing` events.
 */
export function createChatService({ pool, realtime }) {
  async function listMessages({ orgId, before, limit = 50 }) {
    const numLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const conditions = ['m.organization_id = $1'];
    const params = [orgId];
    if (before) {
      params.push(before);
      conditions.push(`m.created_at < (SELECT created_at FROM chat_messages WHERE id = $${params.length})`);
    }
    const { rows } = await pool.query(
      `${MESSAGE_SELECT}
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.created_at DESC
        LIMIT ${numLimit}`,
      params,
    );
    return { data: rows.map(mapMessage).reverse() };
  }

  async function sendMessage({ orgId, userId, body }) {
    const { rows } = await pool.query(
      `INSERT INTO chat_messages (organization_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [orgId, userId, body],
    );
    const message = mapMessage({
      ...rows[0],
      author_name: null,
      author_avatar_url: null,
    });
    const { rows: actorRows } = await pool.query(
      'SELECT name, avatar_url FROM users WHERE id = $1',
      [userId],
    );
    message.author = actorRows[0]
      ? { id: userId, name: actorRows[0].name, avatarUrl: actorRows[0].avatar_url ?? null }
      : null;
    realtime?.emitToRoom?.(`chat:${orgId}`, 'chat:message', { message });
    return { data: message };
  }

  return { listMessages, sendMessage };
}
