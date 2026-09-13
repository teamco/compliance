import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { PageLayout } from '@/components/PageLayout';
import { ScrollableRow } from '@/components/ui/scrollable-row';
import { RiskHeatmap } from '@/components/risks/RiskHeatmap';
import { RiskTable } from '@/components/risks/RiskTable';
import { RiskMethodologySheet } from '@/components/risks/RiskMethodologySheet';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssets } from '@/queries/assets';
import { useVendors } from '@/queries/vendors';
import {
  useRisks,
  useCreateRisk,
  useDeleteRisk,
  useRiskMethodology,
  useRiskTaxonomy,
} from '@/queries/risks';
import type { RiskInput } from '@icore/shared';

const EMPTY_FORM: RiskInput = {
  title: '',
  riskStatement: '',
  taxonomyCategoryId: '',
  ownerId: '',
  inherentLikelihood: 0,
  inherentImpact: 0,
};

export function RisksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: risks = [], isPending } = useRisks(orgId);
  const { data: methodology } = useRiskMethodology(orgId);
  const { data: taxonomy = [] } = useRiskTaxonomy(orgId);
  const { data: assets = [] } = useAssets(orgId);
  const { data: vendors = [] } = useVendors(orgId);
  const createMut = useCreateRisk(orgId);
  const deleteMut = useDeleteRisk();

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<RiskInput>(EMPTY_FORM);
  const [heatmapMode, setHeatmapMode] = useState<'inherent' | 'residual'>('inherent');
  const [cellFilter, setCellFilter] = useState<{ likelihood: number; impact: number } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAboveAppetite, setShowAboveAppetite] = useState(false);

  const owners = useMemo(() => [...new Set(risks.map((r) => r.ownerId))].sort(), [risks]);

  const filtered = useMemo(() => {
    return risks.filter((r) => {
      if (categoryFilter && r.taxonomyCategoryId !== categoryFilter) return false;
      if (ownerFilter && r.ownerId !== ownerFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (showAboveAppetite && !r.aboveAppetite) return false;
      if (cellFilter) {
        const l = heatmapMode === 'inherent' ? r.inherentLikelihood : r.residualLikelihood;
        const i = heatmapMode === 'inherent' ? r.inherentImpact : r.residualImpact;
        if (l !== cellFilter.likelihood || i !== cellFilter.impact) return false;
      }
      return true;
    });
  }, [
    risks,
    categoryFilter,
    ownerFilter,
    statusFilter,
    showAboveAppetite,
    cellFilter,
    heatmapMode,
  ]);

  const summary = useMemo(() => {
    const active = risks.filter((r) => r.status !== 'closed');
    const critical = active.filter((r) => r.inherentLabel === 'critical').length;
    const high = active.filter((r) => r.inherentLabel === 'high').length;
    const aboveAppetite = active.filter((r) => r.aboveAppetite).length;
    const overdue = active.filter(
      (r) => r.targetDate && r.targetDate < new Date().toISOString(),
    ).length;
    return { total: active.length, critical, high, aboveAppetite, overdue };
  }, [risks]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.taxonomyCategoryId || !form.ownerId) return;
    if (!form.inherentLikelihood || !form.inherentImpact) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setCreateOpen(false);
        setForm(EMPTY_FORM);
      },
    });
  }

  return (
    <PageLayout title={t('nav.risks')}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          <span className="font-semibold text-foreground">
            {summary.total} {t('risks.summaryActive')} · {summary.critical}{' '}
            {t('risks.summaryCritical')} · {summary.high} {t('risks.summaryHigh')} ·{' '}
            {summary.aboveAppetite} {t('risks.summaryAboveAppetite')} · {summary.overdue}{' '}
            {t('risks.summaryOverdue')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RiskMethodologySheet orgId={orgId} />
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!orgId}>
            <Plus size={14} className="mr-1.5" />
            {t('risks.addRisk')}
          </Button>
        </div>
      </div>

      {methodology && (
        <div className="mb-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHeatmapMode('inherent')}
              className={`px-2 py-1 rounded text-xs cursor-pointer ${heatmapMode === 'inherent' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.heatmap.inherent')}
            </button>
            <button
              type="button"
              onClick={() => setHeatmapMode('residual')}
              className={`px-2 py-1 rounded text-xs cursor-pointer ${heatmapMode === 'residual' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.heatmap.residual')}
            </button>
          </div>
          <RiskHeatmap
            risks={risks}
            methodology={methodology}
            mode={heatmapMode}
            onCellClick={(likelihood, impact) =>
              setCellFilter((prev) =>
                prev?.likelihood === likelihood && prev?.impact === impact
                  ? null
                  : { likelihood, impact },
              )
            }
          />
        </div>
      )}

      <ScrollableRow className="mb-3">
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
          >
            <option value="">{t('risks.filterAllCategories')}</option>
            {taxonomy.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
          >
            <option value="">{t('risks.filterAllOwners')}</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
          >
            <option value="">{t('risks.filterAllStatus')}</option>
            {(['open', 'monitoring', 'closed'] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAboveAppetite}
              onChange={(e) => setShowAboveAppetite(e.target.checked)}
              className="accent-green-500"
            />
            <span className="text-xs text-muted-foreground">{t('risks.filterAboveAppetite')}</span>
          </label>
        </div>
      </ScrollableRow>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <RiskTable
          risks={filtered}
          taxonomy={taxonomy}
          onRowClick={(id) => void navigate({ to: '/risks/$id', params: { id } })}
          onDeleteClick={setConfirmDeleteId}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('risks.addRisk')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col max-h-[70vh]">
            <div className="space-y-3 overflow-y-auto px-1 -mx-1">
              <div>
                <Label htmlFor="risk-title">{t('risks.title')}</Label>
                <Input
                  id="risk-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="risk-statement">{t('risks.riskStatement')}</Label>
                <textarea
                  id="risk-statement"
                  value={form.riskStatement}
                  onChange={(e) => setForm((f) => ({ ...f, riskStatement: e.target.value }))}
                  placeholder={t('risks.riskStatementPlaceholder')}
                  rows={3}
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('risks.category')}</Label>
                  <select
                    value={form.taxonomyCategoryId}
                    onChange={(e) => setForm((f) => ({ ...f, taxonomyCategoryId: e.target.value }))}
                    required
                    className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option value="">{t('risks.selectCategory')}</option>
                    {taxonomy
                      .filter((c) => !c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="risk-owner">{t('risks.owner')}</Label>
                  <Input
                    id="risk-owner"
                    value={form.ownerId}
                    onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>{t('risks.affectedAssets')}</Label>
                <MultiSelect
                  options={assets.map((a) => ({ value: a.id, label: a.name }))}
                  selected={form.assetIds ?? []}
                  onChange={(assetIds) => setForm((f) => ({ ...f, assetIds }))}
                  placeholder={t('risks.noAssets')}
                />
              </div>
              <div>
                <Label>{t('risks.relatedVendors')}</Label>
                <MultiSelect
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                  selected={form.vendorIds ?? []}
                  onChange={(vendorIds) => setForm((f) => ({ ...f, vendorIds }))}
                  placeholder={t('risks.noVendors')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('risks.inherentLikelihood')}</Label>
                  <select
                    value={form.inherentLikelihood || ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, inherentLikelihood: Number(e.target.value) }))
                    }
                    required
                    className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option value="">{t('risks.selectLikelihood')}</option>
                    {methodology?.likelihoodLabels.map((label, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1} — {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t('risks.inherentImpact')}</Label>
                  <select
                    value={form.inherentImpact || ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, inherentImpact: Number(e.target.value) }))
                    }
                    required
                    className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option value="">{t('risks.selectImpact')}</option>
                    {methodology?.impactLabels.map((label, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1} — {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-3 border-t border-border pt-3">
              <Button type="submit" disabled={createMut.isPending}>
                {t('risks.addRisk')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('risks.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('risks.deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deleteMut.mutate(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
