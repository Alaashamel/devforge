import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth.js';
import { connectSocket, getSocket, joinRoom, leaveRoom } from '../services/socket.js';

/**
 * Subscribe to realtime events and maintain a set of socket rooms for the
 * lifetime of the component. Rooms are server-authorized; joins that are
 * rejected are simply dropped. Rooms and handlers are kept in a ref (updated
 * in an effect) so subscriptions only change when the authentication state
 * or the room list changes, while latest handler closures stay in effect.
 */
export function useRealtime({ rooms = [], on = {} }) {
  const authenticated = useAuthStore((s) => s.status === 'authenticated');
  const roomsKey = rooms.join('|');
  const stateRef = useRef({ rooms, on });

  useEffect(() => {
    stateRef.current = { rooms, on };
  });

  useEffect(() => {
    if (!authenticated) return undefined;

    connectSocket();
    const socket = getSocket();
    const active = new Set();

    const listeners = Object.keys(stateRef.current.on).map((event) => {
      const listener = (payload) => stateRef.current.on[event]?.(payload);
      socket.on(event, listener);
      return () => socket.off(event, listener);
    });

    const joinAll = async () => {
      for (const room of stateRef.current.rooms) {
        if (active.has(room)) continue;
        if (await joinRoom(room)) {
          active.add(room);
        }
      }
    };
    socket.on('connect', joinAll);
    if (socket.connected) {
      joinAll();
    }

    return () => {
      socket.off('connect', joinAll);
      for (const room of active) {
        leaveRoom(room);
      }
      listeners.forEach((off) => off());
    };
  }, [authenticated, roomsKey]);
}
