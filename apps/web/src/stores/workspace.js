import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'devforge.workspace';

export const useWorkspaceStore = create(
  persist(
    (set) => ({
      orgId: null,
      selectOrg: (orgId) => set({ orgId }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ orgId: state.orgId }),
    },
  ),
);
