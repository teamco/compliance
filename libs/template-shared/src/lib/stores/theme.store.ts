import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

function detectInitial(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('icore-theme');
  if (stored) {
    try {
      return (JSON.parse(stored) as { state?: { mode?: ThemeMode } }).state?.mode ?? 'dark';
    } catch {
      return 'dark';
    }
  }
  return 'dark';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: detectInitial(),
      setMode: (mode) => set({ mode }),
      toggle: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'icore-theme' },
  ),
);

export const useTheme = () => useThemeStore();
