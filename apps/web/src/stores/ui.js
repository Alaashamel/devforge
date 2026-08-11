import { create } from 'zustand';

const THEME_KEY = 'devforge.theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

const initialTheme = (() => {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(THEME_KEY) ?? 'dark';
})();

applyTheme(initialTheme);

export const useUiStore = create((set) => ({
  theme: initialTheme,
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      window.localStorage.setItem(THEME_KEY, next);
      return { theme: next };
    }),
}));
