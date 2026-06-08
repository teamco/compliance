import { Edit2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Organization } from '@/queries/notes';

interface OrgListProps {
  orgs: Organization[];
  activeOrgId: string | null;
  onEdit: (orgId: string) => void;
  onDelete: (orgId: string) => void;
}

export function OrgList({ orgs, activeOrgId, onEdit, onDelete }: OrgListProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
      {orgs.map((org) => (
        <div
          key={org.id}
          className={[
            'flex h-full flex-col rounded-xl border p-3 transition-colors',
            org.id === activeOrgId
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-border bg-surface',
          ].join(' ')}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{org.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t(`org.industries.${org.industry}`)} · {t(`org.sizes.${org.size}`)}
            </p>
          </div>
          <footer className="mt-auto flex w-full flex-wrap items-center justify-end gap-1 pt-3">
            <button
              type="button"
              onClick={() => onEdit(org.id)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-muted"
            >
              <Edit2 size={12} />
              {t('common.edit')}
            </button>
            <button
              type="button"
              onClick={() => onDelete(org.id)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-destructive/10"
            >
              <Trash2 size={12} />
              {t('common.delete')}
            </button>
          </footer>
        </div>
      ))}

      {orgs.length === 0 && (
        <p className="text-sm text-muted-foreground sm:col-span-2 2xl:col-span-3">
          {t('org.noOrgs')}
        </p>
      )}
    </div>
  );
}
