import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ClipboardList, Plus } from 'lucide-react';
import { useDraft } from '@icore/template-shared';
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
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { PageLayout } from '@/components/PageLayout';
import {
  useAssessment,
  useAssessmentItems,
  useAddAssessmentItem,
  useUpdateAssessment,
  useDeleteAssessmentItem,
  type RiskAssessment,
  type RiskAssessmentItemInput,
} from '@/queries/assessments';
import { useActiveOrgStore } from '@/stores/active-org';

export const Route = createFileRoute('/_dashboard/assessments_/$id')({
  component: AssessmentDetailPage,
});

const LIKELIHOOD_OPTIONS: Array<RiskAssessmentItemInput['likelihood']> = [
  'very_low',
  'low',
  'medium',
  'high',
  'very_high',
];
const IMPACT_OPTIONS: Array<RiskAssessmentItemInput['impact']> = [
  'very_low',
  'low',
  'medium',
  'high',
  'very_high',
];
const STATUS_OPTIONS: Array<RiskAssessment['status']> = ['draft', 'in_review', 'completed'];

const SCORE_COLOR = (score: number) => {
  if (score >= 20) return 'text-red-400';
  if (score >= 12) return 'text-orange-400';
  if (score >= 6) return 'text-amber-400';
  return 'text-green-400';
};

const EMPTY_FORM: RiskAssessmentItemInput = {
  subject: '',
  description: '',
  likelihood: 'medium',
  impact: 'medium',
};

function AssessmentDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assessment, isPending: aLoading } = useAssessment(id);
  const { data: items = [], isPending: iLoading } = useAssessmentItems(id);
  const addItemMut = useAddAssessmentItem(id);
  const deleteItemMut = useDeleteAssessmentItem(id);
  const updateAssessmentMut = useUpdateAssessment(orgId, id);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RiskAssessmentItemInput>(EMPTY_FORM);
  const isDirty = open && JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  const { showDialog, confirmLeave, cancelLeave } = useDraft(isDirty);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject) return;
    addItemMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(EMPTY_FORM);
      },
    });
  }

  if (aLoading) {
    return (
      <PageLayout title="…">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      </PageLayout>
    );
  }

  if (!assessment) {
    return (
      <PageLayout title={t('common.notFound')}>
        <p className="text-sm text-muted-foreground">{t('assessments.notFound')}</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={assessment.title}>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void navigate({ to: '/assessments' })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {t('assessments.backToList')}
        </button>
        <div className="flex items-center gap-2">
          <select
            value={assessment.status}
            onChange={(e) =>
              updateAssessmentMut.mutate({ status: e.target.value as RiskAssessment['status'] })
            }
            className="text-xs h-7 rounded border border-border bg-surface px-2 text-foreground focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`assessments.status.${s}`)}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            {t('assessments.addItem')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4">
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground/60">
            {t('assessments.scope')}
          </p>
          <p className="text-sm text-foreground">{assessment.scope || '—'}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] uppercase font-bold text-muted-foreground/60">
            {t('assessments.avgScore')}
          </p>
          <p className={`text-2xl font-bold tabular-nums ${SCORE_COLOR(assessment.riskScore)}`}>
            {assessment.riskScore}
          </p>
        </div>
      </div>

      {iLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-12">
          {t('assessments.noItems')}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 bg-surface border border-border rounded-xl p-4"
            >
              <span
                className={`text-lg font-bold tabular-nums shrink-0 ${SCORE_COLOR(item.itemScore)}`}
              >
                {item.itemScore}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{item.subject}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  L: {item.likelihood} · I: {item.impact}
                  {item.mitigations && ` · ${item.mitigations}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteItemMut.mutate(item.id)}
                className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" />
              {t('assessments.addItem')}
            </DialogTitle>
            <DialogDescription>{t('assessments.addItemDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('assessments.subject')}</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder={t('assessments.subjectPlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('risks.likelihood')}</Label>
                <select
                  value={form.likelihood}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, likelihood: e.target.value as typeof form.likelihood }))
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
                    setForm((f) => ({ ...f, impact: e.target.value as typeof form.impact }))
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
            <div className="space-y-2">
              <Label>{t('assessments.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('assessments.mitigations')}</Label>
              <Input
                value={form.mitigations ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, mitigations: e.target.value }))}
                placeholder={t('assessments.mitigationsPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={addItemMut.isPending}>
                {addItemMut.isPending ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </PageLayout>
  );
}
