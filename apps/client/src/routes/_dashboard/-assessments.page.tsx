import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList } from 'lucide-react';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { Button } from '@/components/ui/button';
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
import { PageLayout } from '@/components/PageLayout';
import { AssessmentTypesSheet } from '@/components/assessments/AssessmentTypesSheet';
import { AssessmentWizard } from '@/components/assessments/AssessmentWizard';
import { useActiveOrgStore } from '@/stores/active-org';
import { useOrgMembers } from '@/queries/org-members';
import { useAssessmentTypes } from '@/queries/assessment-types';
import { useAssessments, useDeleteAssessment } from '@/queries/assessments';

const SCORE_COLOR = (label?: string) => {
  if (label === 'critical') return 'text-red-400';
  if (label === 'high') return 'text-orange-400';
  if (label === 'medium') return 'text-amber-400';
  if (label === 'low') return 'text-green-400';
  return 'text-muted-foreground';
};

export function AssessmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';
  const currentUserId = useAuthStore((s) => s.user?.id);
  const notify = useNotify();

  const { data: assessments = [], isPending } = useAssessments(orgId);
  const { data: types = [] } = useAssessmentTypes(orgId);
  const { data: members = [] } = useOrgMembers(orgId);
  const deleteMut = useDeleteAssessment(orgId);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const typeName = (id: string) => types.find((ty) => ty.id === id)?.name ?? '—';
  const memberName = (userId: string) =>
    members.find((m) => m.userId === userId)?.displayName ??
    members.find((m) => m.userId === userId)?.email ??
    userId;

  const summary = useMemo(() => {
    const active = assessments.filter((a) => a.status !== 'archived');
    const pendingReview = active.filter((a) => a.status === 'pending_review').length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = active.filter((a) => a.dueDate && a.dueDate < today).length;
    return { total: active.length, pendingReview, overdue };
  }, [assessments]);

  return (
    <PageLayout title={t('nav.assessments')}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          <span className="font-semibold text-foreground">
            {summary.total} {t('assessments.summaryActive')} · {summary.pendingReview}{' '}
            {t('assessments.summaryPendingReview')} · {summary.overdue}{' '}
            {t('assessments.summaryOverdue')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AssessmentTypesSheet orgId={orgId} />
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!orgId}>
            <Plus size={14} className="mr-1.5" />
            {t('assessments.newAssessment')}
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-surface border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ClipboardList size={32} className="opacity-30" />
          <p className="text-sm">{t('assessments.empty')}</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2 px-3">{t('assessments.colCode')}</th>
              <th className="py-2 px-3">{t('assessments.colTitle')}</th>
              <th className="py-2 px-3">{t('assessments.colType')}</th>
              <th className="py-2 px-3">{t('assessments.colOwner')}</th>
              <th className="py-2 px-3">{t('assessments.colInherent')}</th>
              <th className="py-2 px-3">{t('assessments.colResidual')}</th>
              <th className="py-2 px-3">{t('assessments.colStatus')}</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <tr
                key={a.id}
                onClick={() => void navigate({ to: '/assessments/$id', params: { id: a.id } })}
                className="border-b border-border hover:bg-surface cursor-pointer"
              >
                <td className="py-2 px-3 font-mono text-xs">{a.assessmentCode}</td>
                <td className="py-2 px-3">{a.title}</td>
                <td className="py-2 px-3 text-muted-foreground">{typeName(a.assessmentTypeId)}</td>
                <td className="py-2 px-3 text-muted-foreground">{memberName(a.ownerId)}</td>
                <td className={`py-2 px-3 ${SCORE_COLOR(a.highestInherentLabel)}`}>
                  {a.highestInherentScore ?? '—'}
                </td>
                <td className={`py-2 px-3 ${SCORE_COLOR(a.highestResidualLabel)}`}>
                  {a.highestResidualScore ?? '—'}
                </td>
                <td className="py-2 px-3">{t(`assessments.status.${a.status}`)}</td>
                <td className="py-2 px-3 text-center">
                  {a.status === 'draft' && currentUserId === a.ownerId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(a.id);
                      }}
                      className="text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <AssessmentWizard orgId={orgId} open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assessments.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('assessments.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) {
                  deleteMut.mutate(confirmDeleteId, {
                    onError: () => notify.error(t('error.unknown')),
                  });
                }
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
