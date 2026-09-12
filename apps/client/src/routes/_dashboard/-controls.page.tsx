import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFrameworks } from '@/queries/notes';
import { useInternalControlsList, useCreateControl, useDeleteControl } from '@/queries/controls';
import { ControlsTable } from '@/components/controls/ControlsTable';
import { PageLayout } from '@/components/PageLayout';
import { ScrollableRow } from '@/components/ui/scrollable-row';
import { useActiveOrgStore } from '@/stores/active-org';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export function ControlsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();

  const { data: frameworks = [] } = useFrameworks();
  const { data: controls = [], isPending } = useInternalControlsList(activeOrgId ?? undefined);

  const [selectedFwIds, setSelectedFwIds] = useState<Set<string>>(new Set());
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const [domainFilter, setDomainFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [criticalityFilter, setCriticalityFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const createControl = useCreateControl(activeOrgId ?? '');
  const deleteControl = useDeleteControl();

  const domains = useMemo(
    () => [...new Set(controls.map((c) => c.domain).filter((d): d is string => !!d))].sort(),
    [controls],
  );
  const owners = useMemo(() => [...new Set(controls.map((c) => c.owner))].sort(), [controls]);

  const filtered = useMemo(() => {
    return controls.filter((c) => {
      if (
        selectedFwIds.size > 0 &&
        !(c.frameworkMappings ?? []).some((m) => selectedFwIds.has(m.frameworkId))
      )
        return false;
      if (domainFilter && c.domain !== domainFilter) return false;
      if (ownerFilter && c.owner !== ownerFilter) return false;
      if (criticalityFilter && c.criticality !== criticalityFilter) return false;
      return true;
    });
  }, [controls, selectedFwIds, domainFilter, ownerFilter, criticalityFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const implemented = filtered.filter((c) => c.implementationStatus === 'implemented').length;
    const partial = filtered.filter(
      (c) => c.implementationStatus === 'partially_implemented',
    ).length;
    const gaps = filtered.filter(
      (c) =>
        c.implementationStatus === 'not_implemented' || c.operatingEffectiveness === 'ineffective',
    ).length;
    const totalFrameworkRequirements = frameworks.reduce(
      (sum, fw) => sum + (fw.requirementsCount ?? 0),
      0,
    );
    const coveredRequirementKeys = new Set(
      filtered.flatMap((c) =>
        (c.frameworkMappings ?? []).map((m) => `${m.frameworkId}:${m.requirementCode}`),
      ),
    );
    const coveragePct =
      totalFrameworkRequirements === 0
        ? 0
        : Math.min(
            100,
            Math.round((coveredRequirementKeys.size / totalFrameworkRequirements) * 100),
          );
    return { total, implemented, partial, gaps, coveragePct };
  }, [filtered, frameworks]);

  function toggleFramework(id: string) {
    setSelectedFwIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PageLayout title={t('nav.controls')}>
      <div className="mb-4 flex items-center gap-4 text-sm">
        <span className="font-semibold text-foreground">
          {summary.total} {t('controls.summaryTotal')} · {summary.implemented}{' '}
          {t('controls.summaryImplemented')} · {summary.partial} {t('controls.summaryPartial')} ·{' '}
          {summary.gaps} {t('controls.summaryGaps')}
        </span>
        <span className="text-muted-foreground">
          {summary.coveragePct}% {t('controls.summaryCoverage')}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <ScrollableRow className="gap-1.5">
          {frameworks.map((fw) => (
            <button
              key={fw.id}
              type="button"
              onClick={() => toggleFramework(fw.id)}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer shrink-0 ${
                selectedFwIds.has(fw.id)
                  ? 'bg-green-500/10 border-green-500/20 text-green-500'
                  : 'bg-surface border-border text-muted-foreground/50'
              }`}
            >
              {fw.slug.toUpperCase()}
            </button>
          ))}
        </ScrollableRow>

        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          <option value="">{t('controls.filterAllDomains')}</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          <option value="">{t('controls.filterAllOwners')}</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={criticalityFilter}
          onChange={(e) => setCriticalityFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          <option value="">{t('controls.filterAllCriticality')}</option>
          {['critical', 'high', 'medium', 'low'].map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showGapsOnly}
            onChange={(e) => setShowGapsOnly(e.target.checked)}
            className="accent-green-500"
          />
          <span className="text-xs text-muted-foreground">{t('controls.showGapsOnly')}</span>
        </label>

        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          {t('controls.addControl')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <ControlsTable
          controls={filtered}
          showGapsOnly={showGapsOnly}
          onDeleteClick={setConfirmDeleteId}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('controls.addControl')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              createControl.mutate(
                {
                  code: String(form.get('code')),
                  title: String(form.get('title')),
                  description: String(form.get('description')),
                  domain: String(form.get('domain')),
                  owner: String(form.get('owner')),
                  category: String(form.get('domain')),
                  criticality: 'medium',
                  controlType: 'preventive',
                  execution: 'manual',
                  frequency: 'quarterly',
                  nature: 'technical',
                },
                { onSuccess: () => setCreateOpen(false) },
              );
            }}
          >
            <div>
              <Label htmlFor="code">{t('controls.colCode')}</Label>
              <Input id="code" name="code" required placeholder="IAM-001" />
            </div>
            <div>
              <Label htmlFor="title">{t('controls.colTitle')}</Label>
              <Input id="title" name="title" required />
            </div>
            <div>
              <Label htmlFor="description">{t('controls.fieldDescription')}</Label>
              <Input id="description" name="description" required />
            </div>
            <div>
              <Label htmlFor="domain">{t('controls.colDomain')}</Label>
              <Input id="domain" name="domain" required />
            </div>
            <div>
              <Label htmlFor="owner">{t('controls.colOwner')}</Label>
              <Input id="owner" name="owner" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createControl.isPending}>
                {t('controls.addControl')}
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
            <AlertDialogTitle>{t('controls.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('controls.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deleteControl.mutate(confirmDeleteId);
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
