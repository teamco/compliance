import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/PageLayout';
import { ScrollableRow } from '@/components/ui/scrollable-row';
import { useRisk, useRiskTaxonomy, useRiskControlMappings } from '@/queries/risks';
import { useActiveOrgStore } from '@/stores/active-org';

type Tab =
  'overview' | 'assessment' | 'controls' | 'treatment' | 'relationships' | 'evidence' | 'history';

export function RiskDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_dashboard/risks_/$id' });
  const { activeOrgId } = useActiveOrgStore();
  const { data: risk, isPending } = useRisk(id);
  const { data: taxonomy = [] } = useRiskTaxonomy(activeOrgId ?? undefined);
  const { data: mappings = [] } = useRiskControlMappings(id);
  const [tab, setTab] = useState<Tab>('overview');

  if (isPending || !risk) {
    return (
      <PageLayout title={t('risks.detailTitle')}>
        <div className="h-64 bg-surface border border-border rounded-lg animate-pulse" />
      </PageLayout>
    );
  }

  const categoryName = taxonomy.find((c) => c.id === risk.taxonomyCategoryId)?.name ?? '—';
  const tabs: Tab[] = [
    'overview',
    'assessment',
    'controls',
    'treatment',
    'relationships',
    'evidence',
    'history',
  ];

  return (
    <PageLayout title={`${risk.riskId} — ${risk.title}`}>
      <ScrollableRow className="border-b border-border mb-4">
        <div className="flex items-center gap-1">
          {tabs.map((tKey) => (
            <button
              key={tKey}
              type="button"
              onClick={() => setTab(tKey)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${
                tab === tKey
                  ? 'border-green-500 text-foreground font-medium'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {t(`risks.tab.${tKey}`)}
            </button>
          ))}
        </div>
      </ScrollableRow>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label={t('risks.colId')} value={risk.riskId} />
          <Field label={t('risks.title')} value={risk.title} />
          <Field label={t('risks.riskStatement')} value={risk.riskStatement} />
          <Field label={t('risks.category')} value={categoryName} />
          <Field label={t('risks.owner')} value={risk.ownerId} />
          <Field label={t('risks.businessUnit')} value={risk.businessUnit ?? ''} />
          <Field
            label={t('risks.colInherent')}
            value={`${risk.inherentScore} — ${risk.inherentLabel} (L:${risk.inherentLikelihood} × I:${risk.inherentImpact})`}
          />
          <Field
            label={t('risks.colResidual')}
            value={
              risk.residualScore != null
                ? `${risk.residualScore} — ${risk.residualLabel} (L:${risk.residualLikelihood} × I:${risk.residualImpact})`
                : t('risks.notYetAssessed')
            }
          />
          <Field
            label={t('risks.colAppetite')}
            value={
              risk.aboveAppetite === undefined
                ? '—'
                : risk.aboveAppetite
                  ? t('risks.aboveAppetite')
                  : t('risks.withinAppetite')
            }
          />
          <Field label={t('risks.colStatus')} value={risk.status} />
        </div>
      )}

      {tab === 'assessment' && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          {t('risks.noAssessmentsYet')}
        </div>
      )}

      {tab === 'controls' && (
        <div className="space-y-2 text-sm">
          {mappings.map((m) => (
            <div
              key={m.id}
              className="border border-border rounded-lg p-3 flex items-center justify-between"
            >
              <div>
                <span className="font-mono text-xs mr-2">{m.controlCode}</span>
                <span>{m.controlTitle}</span>
              </div>
              <span className="text-xs text-muted-foreground">{m.effectivenessNote ?? '—'}</span>
            </div>
          ))}
          {mappings.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              {t('risks.noMitigatingControls')}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-foreground">{value || '—'}</div>
    </div>
  );
}
