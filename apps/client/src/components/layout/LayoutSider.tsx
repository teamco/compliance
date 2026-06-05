import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@icore/template-shared';
import {
  LayoutDashboard,
  Shield,
  BookOpen,
  GitMerge,
  BarChart3,
  Bot,
  Users,
  UserCircle,
  Settings,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useSidebar } from '../../layouts/sidebar-context';

interface NavSection {
  titleKey: NavKey;
  items: NavItem[];
}

type NavKey =
  | 'nav.dashboard'
  | 'nav.analytics'
  | 'nav.frameworks'
  | 'nav.controls'
  | 'nav.gapAnalysis'
  | 'nav.aiUsage'
  | 'nav.users'
  | 'nav.sectionPlatform'
  | 'nav.sectionCompliance'
  | 'nav.sectionAdmin';

interface NavItem {
  labelKey: NavKey;
  to: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  soon?: boolean;
}

interface NavSection {
  titleKey: NavKey;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    titleKey: 'nav.sectionPlatform',
    items: [
      { labelKey: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard },
      { labelKey: 'nav.analytics', to: '/analytics', icon: BarChart3, soon: true },
    ],
  },
  {
    titleKey: 'nav.sectionCompliance',
    items: [
      { labelKey: 'nav.frameworks', to: '/frameworks', icon: BookOpen, soon: true },
      { labelKey: 'nav.controls', to: '/controls', icon: Shield, soon: true },
      { labelKey: 'nav.gapAnalysis', to: '/gap-analysis', icon: GitMerge, soon: true },
    ],
  },
  {
    titleKey: 'nav.sectionAdmin',
    items: [
      { labelKey: 'nav.aiUsage', to: '/admin/ai-usage', icon: Bot, adminOnly: true },
      { labelKey: 'nav.users', to: '/admin/users', icon: Users, adminOnly: true, soon: true },
    ],
  },
];

export function LayoutSider() {
  const { t } = useTranslation();
  const { collapsed, toggle } = useSidebar();
  const user = useAuthStore((s) => s.user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = user?.role === 'admin';

  function isActive(to: string) {
    return pathname === to || pathname.startsWith(to + '/');
  }

  return (
    <aside
      className={`relative flex flex-col border-r border-border bg-surface transition-all duration-200 shrink-0 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
          <ShieldCheck className="w-4 h-4 text-green-500" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm text-foreground tracking-tight">
            Compliance<span className="text-green-500">IQ</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {NAV.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.titleKey}>
              {!collapsed && (
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  {t(section.titleKey)}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = !item.soon && isActive(item.to);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.soon ? '#' : item.to}
                      title={collapsed ? t(item.labelKey) : undefined}
                      aria-label={t(item.labelKey)}
                      onClick={item.soon ? (e) => e.preventDefault() : undefined}
                      className={[
                        'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors duration-150 cursor-pointer',
                        active
                          ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                          : item.soon
                            ? 'text-muted-foreground/30 cursor-not-allowed'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      ].join(' ')}
                    >
                      <Icon size={16} className="shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{t(item.labelKey)}</span>}
                      {!collapsed && item.soon && (
                        <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50">
                          {t('common.soon')}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border px-2 py-2 space-y-0.5">
        <Link
          to="/profile"
          title={collapsed ? t('nav.profile') : undefined}
          aria-label={t('nav.profile')}
          className={[
            'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors duration-150 cursor-pointer',
            isActive('/profile')
              ? 'bg-green-500/10 text-green-500 border border-green-500/20'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          ].join(' ')}
        >
          <UserCircle size={16} className="shrink-0" />
          {!collapsed && <span className="flex-1 truncate">{t('nav.profile')}</span>}
        </Link>
        <button
          type="button"
          title={collapsed ? 'Settings' : undefined}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-muted-foreground/30 cursor-not-allowed"
        >
          <Settings size={16} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate">{t('nav.settings')}</span>
              <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50">
                {t('common.soon')}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-[72px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors shadow-md"
      >
        {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </button>
    </aside>
  );
}
