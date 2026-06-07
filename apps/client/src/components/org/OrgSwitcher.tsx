import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@icore/template-shared';
import { useOrganizations } from '@/queries/notes';
import { useActiveOrgStore } from '@/stores/active-org';

export function OrgSwitcher() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const { data: orgs } = useOrganizations();
  const { activeOrgId, setActiveOrgId } = useActiveOrgStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Auto-select first org when none is active
  useEffect(() => {
    if (!activeOrgId && orgs && orgs.length > 0) {
      setActiveOrgId(orgs[0].id);
    }
  }, [orgs, activeOrgId, setActiveOrgId]);

  if (!isAdmin) return null;

  const activeOrg = orgs?.find((o) => o.id === activeOrgId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 h-8 rounded-md border border-border bg-surface text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Building2 size={14} className="text-muted-foreground shrink-0" />
        <span className="max-w-[140px] truncate">
          {activeOrg ? activeOrg.name : t('org.switchOrg')}
        </span>
        <ChevronDown size={12} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[180px] bg-surface border border-border rounded-lg shadow-lg py-1 text-sm">
          {(orgs ?? []).map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => {
                setActiveOrgId(org.id);
                setOpen(false);
              }}
              className={[
                'w-full text-left px-3 py-1.5 truncate cursor-pointer transition-colors',
                org.id === activeOrgId
                  ? 'text-green-500 bg-green-500/5'
                  : 'text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {org.name}
            </button>
          ))}

          {(orgs ?? []).length === 0 && (
            <p className="px-3 py-1.5 text-muted-foreground text-xs">{t('org.noOrgs')}</p>
          )}

          <div className="border-t border-border mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void navigate({ to: '/org' });
              }}
              className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              <Plus size={12} />
              {t('org.createNew')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
