import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Bug } from 'lucide-react';
import { useDraft, useNotify } from '@icore/template-shared';
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
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useIssues,
  useCreateIssue,
  useUpdateIssue,
  useDeleteIssue,
  type Issue,
  type IssueInput,
} from '@/queries/issues';
import { useOrgMembers } from '@/queries/org-members';

export const Route = createFileRoute('/_dashboard/issues')({
  component: IssuesPage,
});

const SEVERITY_COLORS: Record<Issue['severity'], string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  info: 'bg-muted text-muted-foreground border-border',
};

const STATUS_COLORS: Record<Issue['status'], string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved: 'bg-green-500/10 text-green-400 border-green-500/20',
  wont_fix: 'bg-muted text-muted-foreground border-border',
};

const SEVERITY_OPTIONS: Array<Issue['severity']> = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_OPTIONS: Array<Issue['status']> = ['open', 'in_progress', 'resolved', 'wont_fix'];

const EMPTY_FORM: IssueInput = {
  title: '',
  description: '',
  severity: 'medium',
  reporterId: '',
  ownerId: '',
  affectedAssets: '',
};

export function IssuesPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: issues = [], isPending } = useIssues(orgId);
  const { data: members = [] } = useOrgMembers(orgId);
  const createMut = useCreateIssue(orgId);
  const updateMut = useUpdateIssue(orgId);
  const deleteMut = useDeleteIssue(orgId);
  const notify = useNotify();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<IssueInput>(EMPTY_FORM);
  const isDirty = open && JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  const { showDialog, confirmLeave, cancelLeave } = useDraft(isDirty);

  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.email ?? m.userId,
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.description || !form.reporterId || !form.ownerId) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(EMPTY_FORM);
        notify.success(t('issues.created'));
      },
      onError: () => notify.error(t('error.unknown')),
    });
  }

  return (
    <PageLayout title={t('nav.issues')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('issues.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('issues.addIssue')}
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
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Bug size={32} className="opacity-30" />
          <p className="text-sm">{t('issues.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-sm text-foreground truncate">
                    {issue.title}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[issue.severity]}`}
                  >
                    {t(`issues.severity.${issue.severity}`)}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[issue.status]}`}
                  >
                    {t(`issues.status.${issue.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{issue.description}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <select
                  value={issue.status}
                  onChange={(e) =>
                    updateMut.mutate({
                      id: issue.id,
                      patch: { status: e.target.value as Issue['status'] },
                    })
                  }
                  className="text-xs h-7 rounded border border-border bg-surface px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {t(`issues.status.${s}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(issue.id)}
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
            <DialogTitle className="flex items-center gap-2">
              <Bug size={18} className="text-primary" />
              {t('issues.addIssue')}
            </DialogTitle>
            <DialogDescription>{t('issues.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('issues.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('issues.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.severity.label')}</Label>
              <select
                value={form.severity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, severity: e.target.value as Issue['severity'] }))
                }
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {t(`issues.severity.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('issues.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('issues.descriptionPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.reporter')}</Label>
              <Combobox
                options={memberOptions}
                value={form.reporterId}
                onChange={(v) => setForm((f) => ({ ...f, reporterId: v }))}
                placeholder={t('issues.selectReporter')}
                searchPlaceholder={t('issues.searchMembers')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.affectedAssets')}</Label>
              <Input
                value={form.affectedAssets}
                onChange={(e) => setForm((f) => ({ ...f, affectedAssets: e.target.value }))}
                placeholder={t('issues.affectedAssetsPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.owner')}</Label>
              <Combobox
                options={memberOptions}
                value={form.ownerId}
                onChange={(v) => setForm((f) => ({ ...f, ownerId: v }))}
                placeholder={t('issues.selectOwner')}
                searchPlaceholder={t('issues.searchMembers')}
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
    </PageLayout>
  );
}
