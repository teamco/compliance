import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldAlert } from 'lucide-react';
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
  useExceptions,
  useCreateException,
  useApproveException,
  useRejectException,
  useDeleteException,
  type Exception,
  type ExceptionInput,
} from '@/queries/exceptions';
import { useFrameworks } from '@/queries/notes';

export const Route = createFileRoute('/_dashboard/exceptions')({
  component: ExceptionsPage,
});

const STATUS_COLORS: Record<Exception['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-muted text-muted-foreground border-border',
};

function ExceptionsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: exceptions = [], isPending } = useExceptions(orgId);
  const { data: frameworks = [] } = useFrameworks();
  const createMut = useCreateException(orgId);
  const approveMut = useApproveException(orgId);
  const rejectMut = useRejectException(orgId);
  const deleteMut = useDeleteException(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExceptionInput>({
    controlCode: '',
    frameworkId: '',
    title: '',
    justification: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.controlCode || !form.frameworkId || !form.title || !form.justification) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm({ controlCode: '', frameworkId: '', title: '', justification: '' });
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
            <div
              key={exc.id}
              className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-foreground truncate">{exc.title}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[exc.status]}`}
                  >
                    {t(`exceptions.status.${exc.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{exc.justification}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {exc.controlCode} ·{' '}
                  {frameworks.find((f) => f.id === exc.frameworkId)?.slug.toUpperCase() ??
                    exc.frameworkId}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {exc.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => approveMut.mutate(exc.id)}
                      className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                    >
                      {t('exceptions.approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMut.mutate(exc.id)}
                      className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      {t('exceptions.reject')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(exc.id)}
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
            <DialogTitle>{t('exceptions.addException')}</DialogTitle>
            <DialogDescription>{t('exceptions.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('exceptions.controlCode')}</Label>
              <Input
                value={form.controlCode}
                onChange={(e) => setForm((f) => ({ ...f, controlCode: e.target.value }))}
                placeholder="AC-1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.framework')}</Label>
              <select
                value={form.frameworkId}
                onChange={(e) => setForm((f) => ({ ...f, frameworkId: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                required
              >
                <option value="" disabled>
                  {t('exceptions.selectFramework')}
                </option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.slug.toUpperCase()} — {fw.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('exceptions.titlePlaceholder')}
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
