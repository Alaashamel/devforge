import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, setAccessToken, setRefreshHandler } from '../services/api.js';

const STORAGE_KEY = 'devforge.auth';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      status: 'idle',
      user: null,
      accessToken: null,
      refreshToken: null,
      error: null,

      async bootstrap() {
        const { refreshToken } = get();
        if (!refreshToken) {
          set({ status: 'unauthenticated' });
          return;
        }
        set({ status: 'loading', error: null });
        try {
          const data = await api.refresh({ token: refreshToken });
          set({
            status: 'authenticated',
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            user: data.user ?? get().user,
            error: null,
          });
        } catch {
          set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null });
        }
      },

      async login(credentials) {
        set({ status: 'loading', error: null });
        try {
          const data = await api.login(credentials);
          set({
            status: 'authenticated',
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          });
          return data;
        } catch (err) {
          set({ status: 'unauthenticated', error: err.message });
          throw err;
        }
      },

      async register(payload) {
        set({ status: 'loading', error: null });
        try {
          const data = await api.register(payload);
          set({ status: 'unauthenticated', error: null });
          return data;
        } catch (err) {
          set({ status: 'unauthenticated', error: err.message });
          throw err;
        }
      },

      async refreshTokens() {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const data = await api.refresh({ token: refreshToken });
          set({
            status: 'authenticated',
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            error: null,
          });
          return true;
        } catch {
          set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null });
          return false;
        }
      },

      async logout() {
        const { refreshToken } = get();
        if (refreshToken) {
          try {
            await api.logout({ token: refreshToken });
          } catch {
            // Local sign-out proceeds even if the server is unreachable.
          }
        }
        set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ refreshToken: state.refreshToken, user: state.user }),
    },
  ),
);

setAccessToken(useAuthStore.getState().accessToken);
setRefreshHandler(() => useAuthStore.getState().refreshTokens());
useAuthStore.subscribe((state) => {
  setAccessToken(state.accessToken);
});
