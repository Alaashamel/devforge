import { Server } from 'socket.io';

const TYPING_THROTTLE_MS = 2000;
const PRESENCE_TTL_MS = 90_000;
const PRESENCE_SWEEP_MS = 30_000;

function roomFor(type, id) {
  return `${type}:${id}`;
}

/**
 * Realtime hub for the app.
 *
 * - Single Socket.io namespace mounted on the HTTP server in server.js.
 * - Clients authenticate with an access token in the handshake.
 * - Rooms are `user:{id}`, `org:{id}`, `project:{id}`, `task:{id}` and
 *   `chat:{orgId}`. Joining a room is server-authorized against the
 *   database (RBAC), never trusted from the client.
 * - Presence and typing are throttled in-memory; safe to run single
 *   instance. Swap in a Redis adapter when horizontally scaled.
 */
export function createRealtimeHub({ pool, accessTokens, resolveRole }) {
  let io = null;

  const presence = new Map(); // orgId -> Map<userId, { status, lastSeen, sockets:Set }>
  const typing = new Map(); // "userId:threadId" -> lastEmit

  function socketsForOrg(orgId) {
    let org = presence.get(orgId);
    if (!org) {
      org = new Map();
      presence.set(orgId, org);
    }
    return org;
  }

  function getPresence(orgId, userId) {
    return socketsForOrg(orgId).get(userId) ?? null;
  }

  function setStatus(orgId, userId, status, socketId) {
    const entry = socketsForOrg(orgId).get(userId);
    if (entry) {
      entry.status = status;
      entry.lastSeen = Date.now();
      entry.sockets.add(socketId);
    } else {
      socketsForOrg(orgId).set(userId, {
        status,
        lastSeen: Date.now(),
        sockets: new Set([socketId]),
      });
    }
  }

  function touchPresence(orgId, userId, socketId) {
    const entry = getPresence(orgId, userId);
    if (entry) {
      entry.lastSeen = Date.now();
      if (socketId) entry.sockets.add(socketId);
    }
  }

  function removeSocket(orgId, userId, socketId) {
    const entry = getPresence(orgId, userId);
    if (!entry) return;
    entry.sockets.delete(socketId);
    if (entry.sockets.size === 0) {
      socketsForOrg(orgId).delete(userId);
      broadcastPresence(orgId, userId, 'offline');
    }
  }

  function broadcastPresence(orgId, userId, status) {
    io?.of('/realtime').to(roomFor('org', orgId)).emit('presence:update', { userId, status });
  }

  function sweepPresence() {
    const now = Date.now();
    for (const [orgId, org] of presence) {
      for (const [userId, entry] of org) {
        if (now - entry.lastSeen > PRESENCE_TTL_MS && entry.sockets.size === 0) {
          org.delete(userId);
          broadcastPresence(orgId, userId, 'offline');
        }
      }
      if (org.size === 0) presence.delete(orgId);
    }
  }

  async function isOrgMember(userId, orgId) {
    const role = await resolveRole({ userId, orgId });
    return role !== null;
  }

  async function isProjectMember(userId, projectId) {
    const role = await resolveRole({ userId, projectId });
    return role !== null;
  }

  async function verifyRoomAccess({ userId, room }) {
    if (room.startsWith('user:')) {
      return room === roomFor('user', userId);
    }
    if (room.startsWith('org:')) {
      return isOrgMember(userId, room.slice(4));
    }
    if (room.startsWith('project:')) {
      return isProjectMember(userId, room.slice(8));
    }
    if (room.startsWith('task:')) {
      const taskId = room.slice(5);
      const { rows } = await pool.query(
        'SELECT project_id FROM tasks WHERE id = $1 AND deleted_at IS NULL',
        [taskId],
      );
      if (rows.length === 0) return false;
      return isProjectMember(userId, rows[0].project_id);
    }
    if (room.startsWith('chat:')) {
      return isOrgMember(userId, room.slice(5));
    }
    return false;
  }

  function attach({ server }) {
    if (io) return;
    io = new Server(server, {
      path: '/socket.io',
      serveClient: false,
      cors: { origin: true, credentials: true },
    });
    const realtime = io.of('/realtime');

    realtime.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      const claims = typeof token === 'string' && token ? await accessTokens.verify(token) : null;
      if (!claims) {
        return next(new Error('unauthorized'));
      }
      socket.data.userId = claims.userId;
      next();
    });

    realtime.on('connection', (socket) => {
      const userId = socket.data.userId;
      socket.join(roomFor('user', userId));

      socket.on('room:join', async ({ room }, ack) => {
        const ok = typeof room === 'string' && (await verifyRoomAccess({ userId, room }));
        if (!ok) {
          ack?.({ ok: false, error: 'forbidden' });
          return;
        }
        await socket.join(room);
        ack?.({ ok: true });
      });

      socket.on('room:leave', ({ room }, ack) => {
        if (typeof room === 'string') socket.leave(room);
        ack?.({ ok: true });
      });

      socket.on('presence:join', async ({ orgId, status = 'online' }, ack) => {
        if (!(await isOrgMember(userId, orgId))) {
          ack?.({ ok: false, error: 'forbidden' });
          return;
        }
        await socket.join(roomFor('org', orgId));
        setStatus(orgId, userId, status, socket.id);
        io?.of('/realtime').to(roomFor('org', orgId)).emit('presence:update', { userId, status });
        ack?.({
          ok: true,
          online: [...socketsForOrg(orgId).entries()]
            .map(([id, entry]) => ({ userId: id, status: entry.status }))
            .filter((p) => p.userId !== userId),
        });
      });

      socket.on('presence:heartbeat', ({ orgId }) => {
        if (typeof orgId === 'string' && getPresence(orgId, userId)) {
          touchPresence(orgId, userId, socket.id);
        }
      });

      socket.on('chat:typing', ({ orgId }) => {
        if (typeof orgId !== 'string' || !getPresence(orgId, userId)) return;
        const key = `${userId}:${orgId}`;
        const now = Date.now();
        if ((typing.get(key) ?? 0) > now - TYPING_THROTTLE_MS) return;
        typing.set(key, now);
        io?.of('/realtime')
          .to(roomFor('chat', orgId))
          .emit('chat:typing', { userId, orgId });
      });

      socket.on('disconnect', () => {
        for (const [orgId, org] of presence) {
          if (org.has(userId)) {
            removeSocket(orgId, userId, socket.id);
          }
        }
      });
    });

    const sweep = setInterval(sweepPresence, PRESENCE_SWEEP_MS);
    sweep.unref?.();
    hub.sweepTimer = sweep;
  }

  function emitToUser(userId, event, payload) {
    io?.of('/realtime').to(roomFor('user', userId)).emit(event, payload);
  }

  function emitToRoom(room, event, payload) {
    io?.of('/realtime').to(room).emit(event, payload);
  }

  function getOnlineUserIds(orgId) {
    return [...socketsForOrg(orgId).keys()];
  }

  function close() {
    if (hub.sweepTimer) clearInterval(hub.sweepTimer);
    io?.close();
    io = null;
  }

  const hub = {
    attach,
    emitToUser,
    emitToRoom,
    getOnlineUserIds,
    close,
  };
  return hub;
}
