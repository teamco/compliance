import { createContext, useContext } from 'react';

interface SidebarCtx {
  collapsed: boolean;
  toggle: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} });
export const useSidebar = () => useContext(SidebarContext);
