import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldAlert } from 'lucide-react';
import { useDraft } from '@icore/template-shared';
import { effectiveExceptionStatus } from '@icore/shared/client';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
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
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { PageLayout } from '@/components/PageLayout';
import { ExceptionDetailSheet } from '@/components/exceptions/ExceptionDetailSheet';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useExceptions,
  useCreateException,
  useDeleteException,
  type Exception,
  type ExceptionInput,
} from '@/queries/exceptions';
import { useFindingsByLink } from '@/queries/frameworks';
import { useFrameworks, useFrameworkStandards, useFrameworkControls } from '@/queries/notes';
import { useOrgMembers } from '@/queries/org-members';
import { useRisks } from '@/queries/risks';

type Framework = NonNullable<ReturnType<typeof useFrameworks>['data']>[number];

const STATUS_COLORS: Record<Exception['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-muted text-muted-foreground border-border',
};

const EMPTY_FORM: ExceptionInput = {
  title: '',
  frameworkId: '',
  standardCode: '',
  controlCode: '',
  statement: '',
  justification: '',
  ownerId: '',
  compensatingControls: '',
  expiresAt: '',
  riskId: '',
};

function ExceptionRow({
  exception,
  frameworks,
  onOpen,
  onDelete,
}: {
  exception: Exception;
  frameworks: Framework[];
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { data: linkedFindings = [] } = useFindingsByLink({ exceptionId: exception.id });
  const linkedFinding = linkedFindings[0];
  const status = effectiveExceptionStatus(exception);

  return (
    <div className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left cursor-pointer">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-foreground truncate">{exception.title}</span>
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[status]}`}
          >
            {t(`exceptions.status.${status}`)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{exception.justification}</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          {exception.controlCode} ·{' '}
          {frameworks.find((f) => f.id === exception.frameworkId)?.slug.toUpperCase() ??
            exception.frameworkId}
        </p>
        {linkedFinding && (
          <span className="font-mono text-xs underline text-muted-foreground">
            {t('exceptions.linkedFinding', { code: linkedFinding.code })}
          </span>
        )}
      </button>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded text-muted-foreground border border-border hover:text-destructive hover:border-destructive/50 transition-colors cursor-pointer"
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}

export function ExceptionsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: exceptions = [], isPending } = useExceptions(orgId);
  const { data: frameworks = [] } = useFrameworks();
  const { data: members = [] } = useOrgMembers(orgId);
  const { data: risks = [] } = useRisks(orgId);
  const createMut = useCreateException(orgId);
  const deleteMut = useDeleteException(orgId);

  const [open, setOpen] = useState(false);
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const [form, setForm] = useState<ExceptionInput>(EMPTY_FORM);
  const isDirty = open && JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  const { showDialog, confirmLeave, cancelLeave } = useDraft(isDirty);

  const { data: standards = [] } = useFrameworkStandards(orgId, form.frameworkId);
  const { data: controls = [] } = useFrameworkControls(form.frameworkId);

  const frameworkOptions = frameworks.map((fw) => ({
    value: fw.id,
    label: `${fw.slug.toUpperCase()} — ${fw.name}`,
  }));
  const standardOptions = standards.map((s) => ({
    value: s.code,
    label: `${s.code} — ${s.title}`,
  }));
  const controlOptions = controls.map((c) => ({ value: c.code, label: `${c.code} — ${c.title}` }));
  const ownerOptions = members.map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.email ?? m.userId,
  }));
  const riskOptions = risks.map((r) => ({ value: r.id, label: r.title }));

  function handleFrameworkChange(frameworkId: string) {
    setForm((f) => ({ ...f, frameworkId, standardCode: '', controlCode: '' }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.title ||
      !form.frameworkId ||
      !form.controlCode ||
      !form.statement ||
      !form.justification ||
      !form.ownerId ||
      !form.expiresAt
    )
      return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(EMPTY_FORM);
      },
    });
  }

  return (
    <PageLayout title={t('nav.exceptions')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('exceptions.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('exceptions.addException')}
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
      ) : exceptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ShieldAlert size={32} className="opacity-30" />
          <p className="text-sm">{t('exceptions.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map((exc) => (
            <ExceptionRow
              key={exc.id}
              exception={exc}
              frameworks={frameworks}
              onOpen={() => setSelectedExceptionId(exc.id)}
              onDelete={() => deleteMut.mutate(exc.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-primary" />
              {t('exceptions.addException')}
            </DialogTitle>
            <DialogDescription>{t('exceptions.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('exceptions.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('exceptions.titlePlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('exceptions.framework')}</Label>
                <Combobox
                  options={frameworkOptions}
                  value={form.frameworkId}
                  onChange={handleFrameworkChange}
                  placeholder={t('exceptions.selectFramework')}
                  searchPlaceholder={t('exceptions.searchFramework')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('exceptions.standard')}</Label>
                <Combobox
                  options={standardOptions}
                  value={form.standardCode ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, standardCode: v }))}
                  placeholder={t('exceptions.selectStandard')}
                  searchPlaceholder={t('exceptions.searchStandard')}
                  disabled={!form.frameworkId}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('exceptions.controlCode')}</Label>
                <Combobox
                  options={controlOptions}
                  value={form.controlCode}
                  onChange={(v) => setForm((f) => ({ ...f, controlCode: v }))}
                  placeholder={t('exceptions.selectControl')}
                  searchPlaceholder={t('exceptions.searchControl')}
                  disabled={!form.frameworkId}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('exceptions.owner')}</Label>
                <Combobox
                  options={ownerOptions}
                  value={form.ownerId}
                  onChange={(v) => setForm((f) => ({ ...f, ownerId: v }))}
                  placeholder={t('exceptions.selectOwner')}
                  searchPlaceholder={t('exceptions.searchOwner')}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('exceptions.expiresAt')}</Label>
                <Input
                  type="date"
                  value={form.expiresAt?.slice(0, 10) ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('exceptions.linkedRisk')}</Label>
                <Combobox
                  options={riskOptions}
                  value={form.riskId ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, riskId: v }))}
                  placeholder={t('exceptions.selectRisk')}
                  searchPlaceholder={t('exceptions.searchRisk')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.statement')}</Label>
              <textarea
                value={form.statement}
                onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))}
                placeholder={t('exceptions.statementPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.justification')}</Label>
              <textarea
                value={form.justification}
                onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                placeholder={t('exceptions.justificationPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.compensatingControls')}</Label>
              <textarea
                value={form.compensatingControls}
                onChange={(e) => setForm((f) => ({ ...f, compensatingControls: e.target.value }))}
                placeholder={t('exceptions.compensatingControlsPlaceholder')}
                rows={3}
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
      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
      {selectedExceptionId && exceptions.find((e) => e.id === selectedExceptionId) && (
        <ExceptionDetailSheet
          exception={exceptions.find((e) => e.id === selectedExceptionId)!}
          orgId={orgId}
          open={!!selectedExceptionId}
          onOpenChange={(o) => !o && setSelectedExceptionId(null)}
        />
      )}
    </PageLayout>
  );
}
