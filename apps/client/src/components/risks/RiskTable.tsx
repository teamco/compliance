import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { Risk, RiskTaxonomyCategory } from '@icore/shared';

interface RiskTableProps {
  risks: Risk[];
  taxonomy: RiskTaxonomyCategory[];
  onRowClick: (id: string) => void;
  onDeleteClick: (id: string) => void;
}

export function RiskTable({ risks, taxonomy, onRowClick, onDeleteClick }: RiskTableProps) {
  const { t } = useTranslation();
  const categoryName = (id: string) => taxonomy.find((c) => c.id === id)?.name ?? '—';

  if (risks.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {t('risks.empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-2 px-3">{t('risks.colId')}</th>
            <th className="py-2 px-3">{t('risks.colTitle')}</th>
            <th className="py-2 px-3">{t('risks.colCategory')}</th>
            <th className="py-2 px-3">{t('risks.colOwner')}</th>
            <th className="py-2 px-3">{t('risks.colInherent')}</th>
            <th className="py-2 px-3">{t('risks.colResidual')}</th>
            <th className="py-2 px-3">{t('risks.colAppetite')}</th>
            <th className="py-2 px-3">{t('risks.colTreatment')}</th>
            <th className="py-2 px-3">{t('risks.colStatus')}</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {risks.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r.id)}
              className="border-b border-border hover:bg-surface cursor-pointer"
            >
              <td className="py-2 px-3 font-mono text-xs">{r.riskId}</td>
              <td className="py-2 px-3">{r.title}</td>
              <td className="py-2 px-3 text-muted-foreground">
                {categoryName(r.taxonomyCategoryId)}
              </td>
              <td className="py-2 px-3 text-muted-foreground">{r.ownerId}</td>
              <td className="py-2 px-3">
                {r.inherentScore} · {r.inherentLabel}
              </td>
              <td className="py-2 px-3">
                {r.residualScore != null ? `${r.residualScore} · ${r.residualLabel}` : '—'}
              </td>
              <td className="py-2 px-3">
                {r.aboveAppetite == null ? '—' : r.aboveAppetite ? '⚠' : '✓'}
              </td>
              <td className="py-2 px-3">{r.treatmentStrategy ?? '—'}</td>
              <td className="py-2 px-3">{r.status}</td>
              <td className="py-2 px-3 text-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(r.id);
                  }}
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
