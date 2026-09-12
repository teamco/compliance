import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LayoutHeader } from '../components/layout/LayoutHeader';
import { LayoutSider } from '../components/layout/LayoutSider';
import { AiAssistant } from '../components/ai-assistant/AiAssistant';
import { SidebarContext } from './sidebar-context';

const COLLAPSE_BREAKPOINT_QUERY = '(max-width: 1023px)';

function getInitialCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(COLLAPSE_BREAKPOINT_QUERY).matches;
}

export function MainLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  useEffect(() => {
    const mql = window.matchMedia(COLLAPSE_BREAKPOINT_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
      <div className="min-h-screen flex bg-background text-foreground">
        <LayoutSider />
        <div className="flex flex-col flex-1 min-w-0">
          <LayoutHeader />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
      <AiAssistant />
    </SidebarContext.Provider>
  );
}
