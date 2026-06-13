import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useRisks,
  useCreateRisk,
  useUpdateRisk,
  useDeleteRisk,
  type Risk,
  type RiskInput,
} from '@/queries/risks';
import { useAssets } from '@/queries/assets';

export const Route = createFileRoute('/_dashboard/risks')({
  component: RisksPage,
});

const SCORE_COLOR = (score: number) => {
  if (score >= 20) return 'text-red-400';
  if (score >= 12) return 'text-orange-400';
  if (score >= 6) return 'text-amber-400';
  return 'text-green-400';
};

const LIKELIHOOD_OPTIONS: Array<Risk['likelihood']> = [
  'very_low',
  'low',
  'medium',
  'high',
  'very_high',
];
const IMPACT_OPTIONS: Array<Risk['impact']> = ['very_low', 'low', 'medium', 'high', 'very_high'];
const TREATMENT_OPTIONS: Array<Risk['treatment']> = ['accept', 'mitigate', 'transfer', 'avoid'];

function RisksPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: risks = [], isPending } = useRisks(orgId);
  const { data: assets = [] } = useAssets(orgId);
  const createMut = useCreateRisk(orgId);
  const updateMut = useUpdateRisk(orgId);
  const deleteMut = useDeleteRisk(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RiskInput>({
    title: '',
    description: '',
    category: '',
    likelihood: 'medium',
    impact: 'medium',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.category) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm({
          title: '',
          description: '',
          category: '',
          likelihood: 'medium',
          impact: 'medium',
        });
      },
    });
  }

  return (
    <PageLayout title={t('nav.risks')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('risks.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('risks.addRisk')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : risks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <AlertTriangle size={32} className="opacity-30" />
          <p className="text-sm">{t('risks.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {risks.map((risk) => (
            <div
              key={risk.id}
              className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-lg font-bold tabular-nums ${SCORE_COLOR(risk.riskScore)}`}>
                    {risk.riskScore}
                  </span>
                  <span className="font-medium text-sm text-foreground truncate">{risk.title}</span>
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                    {risk.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{risk.description}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  L: {risk.likelihood} · I: {risk.impact}
                  {risk.assetId &&
                    ` · ${assets.find((a) => a.id === risk.assetId)?.name ?? risk.assetId}`}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <select
                  value={risk.treatment}
                  onChange={(e) =>
                    updateMut.mutate({
                      id: risk.id,
                      patch: { treatment: e.target.value as Risk['treatment'] },
                    })
                  }
                  className="text-xs h-7 rounded border border-border bg-surface px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {TREATMENT_OPTIONS.map((tr) => (
                    <option key={tr} value={tr}>
                      {t(`risks.treatment.${tr}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(risk.id)}
                  className="text-xs px-2 py-1 rounded text-muted-foreground border border-border hover:text-destructive hover:border-destructive/50 transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('risks.addRisk')}</DialogTitle>
            <DialogDescription>{t('risks.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('risks.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('risks.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('risks.category')}</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={t('risks.categoryPlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('risks.likelihood')}</Label>
                <select
                  value={form.likelihood}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, likelihood: e.target.value as Risk['likelihood'] }))
                  }
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {LIKELIHOOD_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {t(`risks.scale.${l}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('risks.impact')}</Label>
                <select
                  value={form.impact}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, impact: e.target.value as Risk['impact'] }))
                  }
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {IMPACT_OPTIONS.map((i) => (
                    <option key={i} value={i}>
                      {t(`risks.scale.${i}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {assets.length > 0 && (
              <div className="space-y-2">
                <Label>{t('risks.linkedAsset')}</Label>
                <select
                  value={form.assetId ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value || undefined }))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  <option value="">{t('risks.noAsset')}</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('risks.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
