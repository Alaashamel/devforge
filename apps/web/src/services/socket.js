import { io } from 'socket.io-client';
import { API_URL } from './api.js';
import { useAuthStore } from '../stores/auth.js';

let socket = null;

function serverUrl() {
  return API_URL.replace(/\/api\/v1\/?$/, '');
}

function createSocket() {
  const token = useAuthStore.getState().accessToken;
  socket = io(`${serverUrl()}/realtime`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
  });
  socket.on('connect_error', (err) => {
    if (err?.message === 'unauthorized') {
      socket?.disconnect();
    }
  });
  return socket;
}

export function getSocket() {
  if (!socket) {
    return createSocket();
  }
  return socket;
}

/**
 * Connect (or re-connect) with the current access token. On reconnect the
 * client re-sends `auth`, and rooms are re-joined by the components that
 * subscribed to them.
 */
export function connectSocket() {
  const token = useAuthStore.getState().accessToken;
  const s = getSocket();
  if (token && s.io.opts.auth?.token !== token) {
    s.io.opts.auth = { token };
    if (s.connected) s.disconnect();
  }
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function joinRoom(room) {
  const s = getSocket();
  if (!s.connected) return Promise.resolve(false);
  return new Promise((resolve) => {
    s.timeout(3000).emit('room:join', { room }, (_err, res) => {
      resolve(res?.ok === true);
    });
  });
}

export function leaveRoom(room) {
  const s = getSocket();
  if (s?.connected) {
    s.emit('room:leave', { room });
  }
}

export function emitEvent(event, payload) {
  const s = getSocket();
  if (s?.connected) {
    s.emit(event, payload);
  }
}

export function onRealtime(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}
