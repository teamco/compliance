import { useState } from 'react';
import type { ReactNode } from 'react';
import { LayoutHeader } from '../components/layout/LayoutHeader';
import { LayoutSider } from '../components/layout/LayoutSider';
import { SidebarContext } from './sidebar-context';

export function MainLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
      <div className="min-h-screen flex bg-background text-foreground">
        <LayoutSider />
        <div className="flex flex-col flex-1 min-w-0">
          <LayoutHeader />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
