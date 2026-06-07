import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useRouterState, Link } from '@tanstack/react-router';
import { useAuthStore, setStoredLocale, SUPPORTED_LOCALES } from '@icore/template-shared';
import { LogOut, Menu, User } from 'lucide-react';
import { useSidebar } from '../../layouts/sidebar-context';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import { useProfile } from '../../queries/profile';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(menuRef, () => setMenuOpen(false));
  const { data: profile } = useProfile();

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

        {/* User menu */}
        <div ref={menuRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="User menu"
            className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-green-500">{initials}</span>
            </div>
            <span className="text-xs text-muted-foreground hidden md:inline max-w-[160px] truncate">
              {user?.email ?? ''}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg border border-border bg-surface shadow-lg z-50 py-1 overflow-hidden">
              {/* Last login */}
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">
                  {t('common.lastLogin')}
                </p>
                <p className="text-xs text-foreground font-medium">
                  {profile?.lastSignedIn ? new Date(profile.lastSignedIn).toLocaleString() : '—'}
                </p>
              </div>

              {/* Profile */}
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <User size={14} className="shrink-0" />
                {t('nav.profile')}
              </Link>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
              >
                <LogOut size={14} className={`shrink-0 ${isRtl ? 'rotate-180' : ''}`} />
                {t('common.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
