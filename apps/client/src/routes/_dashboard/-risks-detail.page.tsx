import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/PageLayout';
import { ScrollableRow } from '@/components/ui/scrollable-row';
import {
  useRisk,
  useRiskTaxonomy,
  useRiskControlMappings,
  useUpdateRisk,
  useActiveRiskAcceptance,
  useCreateRiskAcceptance,
  useApproveRiskAcceptance,
  useRejectRiskAcceptance,
  useRiskEvidence,
  useRiskSnapshots,
} from '@/queries/risks';
import { useAssets } from '@/queries/assets';
import { useVendors } from '@/queries/vendors';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const updateMut = useUpdateRisk(id);
  const { data: activeAcceptance } = useActiveRiskAcceptance(id);
  const createAcceptanceMut = useCreateRiskAcceptance(activeOrgId ?? '', id);
  const approveAcceptanceMut = useApproveRiskAcceptance(id);
  const rejectAcceptanceMut = useRejectRiskAcceptance(id);
  const { data: evidence = [] } = useRiskEvidence(id);
  const { data: snapshots = [] } = useRiskSnapshots(id);
  const { data: assets = [] } = useAssets(activeOrgId ?? '');
  const { data: vendors = [] } = useVendors(activeOrgId ?? '');
  const [tab, setTab] = useState<Tab>('overview');
  const [acceptanceOpen, setAcceptanceOpen] = useState(false);
  const [acceptanceForm, setAcceptanceForm] = useState({
    justification: '',
    compensatingControls: '',
    expiresAt: '',
    approverId: '',
  });

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

      {tab === 'treatment' && (
        <div className="space-y-4 text-sm max-w-2xl">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.treatmentStrategy')}</span>
              <select
                defaultValue={risk.treatmentStrategy ?? ''}
                onChange={(e) =>
                  updateMut.mutate({
                    treatmentStrategy: e.target.value as typeof risk.treatmentStrategy,
                  })
                }
                className="mt-1 w-full h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="">{t('risks.selectTreatment')}</option>
                {(['avoid', 'mitigate', 'transfer', 'accept', 'monitor'] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.treatmentOwner')}</span>
              <Input
                defaultValue={risk.treatmentOwner}
                onBlur={(e) => updateMut.mutate({ treatmentOwner: e.target.value })}
                className="mt-1"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-muted-foreground">{t('risks.treatmentPlan')}</span>
            <textarea
              defaultValue={risk.treatmentPlan}
              onBlur={(e) => updateMut.mutate({ treatmentPlan: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm resize-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.targetScore')}</span>
              <Input
                type="number"
                defaultValue={risk.targetScore}
                onBlur={(e) => updateMut.mutate({ targetScore: Number(e.target.value) })}
                className="mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.targetDate')}</span>
              <Input
                type="date"
                defaultValue={risk.targetDate?.slice(0, 10)}
                onBlur={(e) => updateMut.mutate({ targetDate: e.target.value })}
                className="mt-1"
              />
            </label>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium mb-2">{t('risks.riskAcceptance')}</h3>
            {activeAcceptance ? (
              <div className="border border-border rounded-lg p-3 space-y-1">
                <p>
                  {t('risks.status')}: <strong>{activeAcceptance.status}</strong>
                </p>
                <p className="text-muted-foreground">{activeAcceptance.justification}</p>
                <p className="text-xs text-muted-foreground">
                  {t('risks.expiresAt')}: {activeAcceptance.expiresAt.slice(0, 10)}
                </p>
                {activeAcceptance.status !== 'approved' &&
                  activeAcceptance.status !== 'rejected' && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => approveAcceptanceMut.mutate(activeAcceptance.id)}
                      >
                        {t('risks.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectAcceptanceMut.mutate(activeAcceptance.id)}
                      >
                        {t('risks.reject')}
                      </Button>
                    </div>
                  )}
              </div>
            ) : (
              <Button size="sm" onClick={() => setAcceptanceOpen(true)}>
                {t('risks.acceptRisk')}
              </Button>
            )}
          </div>
        </div>
      )}

      {tab === 'relationships' && (
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="text-xs text-muted-foreground mb-2">{t('risks.affectedAssets')}</h3>
            {risk.assetIds.length === 0 ? (
              <p className="text-muted-foreground">{t('risks.noAssets')}</p>
            ) : (
              risk.assetIds.map((assetId) => (
                <p key={assetId}>{assets.find((a) => a.id === assetId)?.name ?? assetId}</p>
              ))
            )}
          </div>
          <div>
            <h3 className="text-xs text-muted-foreground mb-2">{t('risks.relatedVendors')}</h3>
            {risk.vendorIds.length === 0 ? (
              <p className="text-muted-foreground">{t('risks.noVendors')}</p>
            ) : (
              risk.vendorIds.map((vendorId) => (
                <p key={vendorId}>{vendors.find((v) => v.id === vendorId)?.name ?? vendorId}</p>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-2 text-sm">
          {evidence.map((e) => (
            <div key={e.id} className="border border-border rounded-lg p-3">
              <div className="font-medium">{e.title}</div>
              <div className="text-xs text-muted-foreground">
                {e.owner} · {e.evidenceType} · {e.verificationStatus}
              </div>
            </div>
          ))}
          {evidence.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('risks.noEvidence')}</div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2 text-sm">
          {snapshots.map((s) => (
            <div key={s.id} className="flex items-baseline gap-2 border-b border-border py-1.5">
              <span className="text-xs text-muted-foreground w-32 shrink-0">
                {new Date(s.createdAt).toLocaleString()}
              </span>
              <span>
                {t('risks.colInherent')}: {s.inherentScore} ({s.inherentLabel})
                {s.residualScore != null &&
                  ` · ${t('risks.colResidual')}: ${s.residualScore} (${s.residualLabel})`}
              </span>
              {s.reason && <span className="text-muted-foreground">— {s.reason}</span>}
            </div>
          ))}
          {snapshots.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('risks.noHistory')}</div>
          )}
        </div>
      )}

      <Dialog open={acceptanceOpen} onOpenChange={setAcceptanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('risks.acceptRisk')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createAcceptanceMut.mutate(acceptanceForm, {
                onSuccess: () => setAcceptanceOpen(false),
              });
            }}
          >
            <div>
              <Label>{t('risks.justification')}</Label>
              <textarea
                value={acceptanceForm.justification}
                onChange={(e) =>
                  setAcceptanceForm((f) => ({ ...f, justification: e.target.value }))
                }
                required
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              />
            </div>
            <div>
              <Label>{t('risks.compensatingControls')}</Label>
              <textarea
                value={acceptanceForm.compensatingControls}
                onChange={(e) =>
                  setAcceptanceForm((f) => ({ ...f, compensatingControls: e.target.value }))
                }
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('risks.expiresAt')}</Label>
                <Input
                  type="date"
                  value={acceptanceForm.expiresAt}
                  onChange={(e) => setAcceptanceForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>{t('risks.approver')}</Label>
                <Input
                  value={acceptanceForm.approverId}
                  onChange={(e) => setAcceptanceForm((f) => ({ ...f, approverId: e.target.value }))}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createAcceptanceMut.isPending}>
                {t('risks.submitAcceptance')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
