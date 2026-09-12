import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { InternalControl } from '@icore/shared';

interface ControlsTableProps {
  controls: InternalControl[];
  showGapsOnly: boolean;
  onDeleteClick?: (id: string) => void;
}

const EFFECTIVENESS_DOT: Record<string, string> = {
  effective: '🟢',
  partially_effective: '🟠',
  ineffective: '🔴',
  not_tested: '⚪',
};

export function ControlsTable({ controls, showGapsOnly, onDeleteClick }: ControlsTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const rows = showGapsOnly
    ? controls.filter(
        (c) =>
          c.operatingEffectiveness === 'ineffective' ||
          c.operatingEffectiveness === 'partially_effective' ||
          c.implementationStatus === 'not_implemented',
      )
    : controls;

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {t('controls.noControls')}
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground border-b border-border">
          <th className="py-2 px-3">{t('controls.colCode')}</th>
          <th className="py-2 px-3">{t('controls.colTitle')}</th>
          <th className="py-2 px-3">{t('controls.colDomain')}</th>
          <th className="py-2 px-3">{t('controls.colOwner')}</th>
          <th className="py-2 px-3">{t('controls.colStatus')}</th>
          <th className="py-2 px-3">{t('controls.colEffectiveness')}</th>
          <th className="py-2 px-3">{t('controls.colFrameworks')}</th>
          <th className="py-2 px-3">{t('controls.colEvidence')}</th>
          <th className="py-2 px-3">{t('controls.colFindings')}</th>
          {onDeleteClick ? <th className="py-2 px-3" /> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const fwNames = [...new Set((c.frameworkMappings ?? []).map((m) => m.frameworkName))];
          return (
            <tr
              key={c.id}
              onClick={() => void navigate({ to: '/controls/$id', params: { id: c.id } })}
              className="border-b border-border hover:bg-surface cursor-pointer"
            >
              <td className="py-2 px-3 font-mono text-xs">{c.code}</td>
              <td className="py-2 px-3">{c.title}</td>
              <td className="py-2 px-3 text-muted-foreground">{c.domain}</td>
              <td className="py-2 px-3 text-muted-foreground">{c.owner}</td>
              <td className="py-2 px-3">{c.implementationStatus?.replace('_', ' ')}</td>
              <td className="py-2 px-3">
                {c.operatingEffectiveness ? EFFECTIVENESS_DOT[c.operatingEffectiveness] : ''}{' '}
                {c.operatingEffectiveness?.replace('_', ' ')}
              </td>
              <td className="py-2 px-3 text-xs text-muted-foreground">
                {fwNames.slice(0, 2).join(', ')}
                {fwNames.length > 2 ? ` +${fwNames.length - 2}` : ''}
              </td>
              <td className="py-2 px-3 text-center">{c.evidenceCount ?? 0}</td>
              <td className="py-2 px-3 text-center">{c.findingsCount ?? 0}</td>
              {onDeleteClick ? (
                <td className="py-2 px-3 text-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteClick(c.id);
                    }}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
