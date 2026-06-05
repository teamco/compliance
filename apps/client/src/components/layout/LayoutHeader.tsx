import { useTranslation } from 'react-i18next';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useAuthStore, setStoredLocale, SUPPORTED_LOCALES } from '@icore/template-shared';
import { LogOut, Menu } from 'lucide-react';
import { useSidebar } from '../../layouts/sidebar-context';
import { ThemeToggle } from '../ThemeToggle';

const BREADCRUMB_KEYS: Array<{ prefix: string; key: string }> = [
  { prefix: '/admin/ai-usage', key: 'nav.aiUsage' },
  { prefix: '/dashboard', key: 'nav.dashboard' },
  { prefix: '/profile', key: 'nav.profile' },
  { prefix: '/analytics', key: 'nav.analytics' },
  { prefix: '/frameworks', key: 'nav.frameworks' },
  { prefix: '/standards', key: 'nav.standards' },
  { prefix: '/org', key: 'nav.org' },
  { prefix: '/controls', key: 'nav.controls' },
  { prefix: '/gap-analysis', key: 'nav.gapAnalysis' },
];

export function LayoutHeader() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const navigate = useNavigate();
  const { toggle } = useSidebar();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const breadcrumbKey = BREADCRUMB_KEYS.find(
    (b) => pathname === b.prefix || pathname.startsWith(b.prefix + '/'),
  )?.key;
  const pageTitle = breadcrumbKey ? t(breadcrumbKey) : '';
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??';

  function handleLogout() {
    logout();
    void navigate({ to: '/login' });
  }

  return (
    <header className="h-14 flex items-center justify-between gap-4 px-4 border-b border-border bg-surface shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle sidebar"
          className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <Menu size={18} />
        </button>
        {pageTitle && (
          <>
            <span className="text-muted-foreground/40 text-sm">/</span>
            <span className="text-sm font-medium text-foreground truncate">{pageTitle}</span>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Locale */}
        <div className="flex items-center gap-0.5 mr-2">
          {SUPPORTED_LOCALES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setStoredLocale(code);
                window.location.reload();
              }}
              className="text-[11px] px-1.5 py-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors font-medium"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User avatar */}
        <div className="flex items-center gap-2 ml-1">
          <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-green-500">{initials}</span>
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline max-w-[160px] truncate">
            {user?.email ?? ''}
          </span>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          aria-label={t('common.logout')}
          title={t('common.logout')}
          className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors ml-1"
        >
          <LogOut size={15} className={isRtl ? 'rotate-180' : undefined} />
        </button>
      </div>
    </header>
  );
}
