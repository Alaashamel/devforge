import { create } from 'zustand';
import { api } from '../services/api.js';

const MAX_ITEMS = 20;

export const useNotificationsStore = create((set, get) => ({
  unread: 0,
  items: [],
  open: false,
  loading: false,

  async refresh() {
    set({ loading: true });
    try {
      const [{ count }, items] = await Promise.all([
        api.getNotificationUnreadCount(),
        api.listNotifications({ limit: MAX_ITEMS }),
      ]);
      set({ unread: count, items });
    } catch {
      // keep the last known state when the fetch fails
    } finally {
      set({ loading: false });
    }
  },

  toggle() {
    const next = !get().open;
    set({ open: next });
    if (next) {
      get().refresh();
    }
  },

  close() {
    if (get().open) {
      set({ open: false });
    }
  },

  async markRead(id) {
    set((state) => {
      const target = state.items.find((n) => n.id === id);
      const wasUnread = target && !target.readAt;
      return {
        items: state.items.map((n) =>
          n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
        ),
        unread: wasUnread ? Math.max(0, state.unread - 1) : state.unread,
      };
    });
    await api.markNotificationRead(id).catch(() => {});
  },

  async markAllRead() {
    set((state) => ({
      items: state.items.map((n) => ({
        ...n,
        readAt: n.readAt ?? new Date().toISOString(),
      })),
      unread: 0,
    }));
    await api.markAllNotificationsRead().catch(() => {});
  },

  handleNew(notification) {
    set((state) => ({
      unread: state.unread + 1,
      items: [
        { ...notification, readAt: notification.readAt ?? null },
        ...state.items,
      ].slice(0, MAX_ITEMS),
    }));
  },
}));
