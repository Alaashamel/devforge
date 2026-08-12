import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/api.js', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  },
  setAccessToken: vi.fn(),
  setRefreshHandler: vi.fn(),
}));

import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useAuthStore.setState({
    status: 'idle',
    user: null,
    accessToken: null,
    refreshToken: null,
    error: null,
  });
});

describe('auth store', () => {
  it('logs in and persists the refresh token', async () => {
    api.login.mockResolvedValue({
      user: { id: 'u1', name: 'Ada', email: 'ada@devforge.test' },
      accessToken: 'at-1',
      refreshToken: 'rt-1',
    });

    await useAuthStore.getState().login({ email: 'ada@devforge.test', password: 'x' });

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('at-1');
    expect(state.refreshToken).toBe('rt-1');
    expect(state.user.name).toBe('Ada');
    expect(window.localStorage.getItem('devforge.auth')).toContain('"refreshToken":"rt-1"');
  });

  it('surfaces a login error', async () => {
    api.login.mockRejectedValue(new Error('Invalid email or password'));

    await expect(
      useAuthStore.getState().login({ email: 'ada@devforge.test', password: 'x' }),
    ).rejects.toThrow('Invalid email or password');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().error).toBe('Invalid email or password');
  });

  it('boots straight to unauthenticated without a refresh token', async () => {
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it('bootstraps a session from a stored refresh token', async () => {
    useAuthStore.setState({ refreshToken: 'rt-0' });
    api.refresh.mockResolvedValue({
      accessToken: 'at-2',
      refreshToken: 'rt-2',
      user: { id: 'u1', name: 'Ada', email: 'ada@devforge.test' },
    });

    await useAuthStore.getState().bootstrap();

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('at-2');
    expect(state.refreshToken).toBe('rt-2');
    expect(api.refresh).toHaveBeenCalledWith({ token: 'rt-0' });
  });

  it('clears the session when a refresh attempt fails', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      user: { id: 'u1', name: 'Ada' },
    });
    api.refresh.mockRejectedValue(new Error('expired'));

    const ok = await useAuthStore.getState().refreshTokens();

    expect(ok).toBe(false);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('revokes the refresh token on logout and clears state', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      user: { id: 'u1', name: 'Ada' },
    });
    api.logout.mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(api.logout).toHaveBeenCalledWith({ token: 'rt-1' });
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
