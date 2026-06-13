import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList } from 'lucide-react';
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
  useAssessments,
  useCreateAssessment,
  type RiskAssessment,
  type RiskAssessmentInput,
} from '@/queries/assessments';

export const Route = createFileRoute('/_dashboard/assessments')({
  component: AssessmentsPage,
});

const STATUS_COLORS: Record<RiskAssessment['status'], string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const SCORE_COLOR = (score: number) => {
  if (score >= 20) return 'text-red-400';
  if (score >= 12) return 'text-orange-400';
  if (score >= 6) return 'text-amber-400';
  return 'text-green-400';
};

function AssessmentsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assessments = [], isPending } = useAssessments(orgId);
  const createMut = useCreateAssessment(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RiskAssessmentInput>({ type: 'cvra', title: '', scope: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm({ type: 'cvra', title: '', scope: '' });
      },
    });
  }

  return (
    <PageLayout title={t('nav.assessments')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('assessments.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('assessments.newAssessment')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 bg-surface border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ClipboardList size={32} className="opacity-30" />
          <p className="text-sm">{t('assessments.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map((a) => (
            <Link
              key={a.id}
              to="/assessments/$id"
              params={{ id: a.id }}
              className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4 hover:border-muted-foreground/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80 border border-border">
                    {a.type.toUpperCase()}
                  </span>
                  <span className="font-medium text-sm text-foreground truncate">{a.title}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[a.status]}`}
                  >
                    {t(`assessments.status.${a.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/60">
                  {a.scope} · {a.itemCount} {t('assessments.items')}
                </p>
              </div>
              <span
                className={`text-xl font-bold tabular-nums shrink-0 ${SCORE_COLOR(a.riskScore)}`}
              >
                {a.riskScore}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.newAssessment')}</DialogTitle>
            <DialogDescription>{t('assessments.newDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('assessments.type')}</Label>
              <div className="flex gap-3">
                {(['cvra', 'ctra'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type }))}
                    className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                      form.type === type
                        ? 'border-green-500/40 bg-green-500/10 text-green-400'
                        : 'border-border bg-surface text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {type.toUpperCase()}
                    <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                      {t(`assessments.typeLabel.${type}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('assessments.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('assessments.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('assessments.scope')}</Label>
              <Input
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                placeholder={t('assessments.scopePlaceholder')}
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
