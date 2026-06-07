import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ActiveOrgStore {
  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
}

export const useActiveOrgStore = create<ActiveOrgStore>()(
  persist(
    (set) => ({
      activeOrgId: null,
      setActiveOrgId: (id) => set({ activeOrgId: id }),
    }),
    { name: 'active-org' },
  ),
);
