import { useState, type ReactNode } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { ArrowLeft, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssessmentTypes } from '@/queries/assessment-types';
import { AssessmentItemsPanel } from '@/components/assessments/AssessmentItemsPanel';
import { useOrgMembers } from '@/queries/org-members';
import { ReassignDialog } from '@/components/shared/ReassignDialog';
import {
  useAssessment,
  useStartAssessment,
  useSubmitForReview,
  useApproveAssessment,
  useRequestChanges,
  useCompleteAssessment,
  useArchiveAssessment,
  useReassignAssessmentApprover,
} from '@/queries/assessments';

export function AssessmentDetailPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { id } = useParams({ from: '/_dashboard/assessments_/$id' });
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: assessment, isPending } = useAssessment(id);
  const { data: types = [] } = useAssessmentTypes(orgId);
  const startMut = useStartAssessment(orgId, id);
  const submitMut = useSubmitForReview(orgId, id);
  const approveMut = useApproveAssessment(orgId, id);
  const requestChangesMut = useRequestChanges(orgId, id);
  const completeMut = useCompleteAssessment(orgId, id);
  const archiveMut = useArchiveAssessment(orgId, id);

  // includeInactive: assessor/approver names must still resolve after that
  // member has been removed from the org.
  const { data: members = [] } = useOrgMembers(orgId, { includeInactive: true });
  // Active-only list for canManage and reassignment targets — a deactivated
  // admin must not retain manage rights or be offered as a new approver.
  const { data: activeMembers = [] } = useOrgMembers(orgId);
  const myMembership = activeMembers.find((m) => m.userId === currentUserId);
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const reassignApproverMut = useReassignAssessmentApprover(orgId, id);
  const [reassignOpen, setReassignOpen] = useState(false);

  const [tab, setTab] = useState<'overview' | 'items'>('overview');
  const [changesNote, setChangesNote] = useState('');

  const memberName = (userId?: string | null) => {
    if (!userId) return '';
    const member = members.find((m) => m.userId === userId);
    return member?.displayName ?? member?.email ?? userId;
  };

  if (isPending || !assessment) {
    return (
      <PageLayout title={t('assessments.detailTitle')}>
        <div className="h-64 bg-surface border border-border rounded-lg animate-pulse" />
      </PageLayout>
    );
  }

  const typeName = types.find((ty) => ty.id === assessment.assessmentTypeId)?.name ?? '—';
  const isOwner = currentUserId === assessment.ownerId;
  const isApprover = currentUserId === assessment.approverId;

  return (
    <PageLayout title={`${assessment.assessmentCode} — ${assessment.title}`}>
      <button
        type="button"
        onClick={() => void navigate({ to: '/assessments' })}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 cursor-pointer"
      >
        <ArrowLeft size={14} />
        {t('assessments.backToList')}
      </button>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          {(['overview', 'items'] as const).map((tKey) => (
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
              {t(`assessments.tab.${tKey}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {assessment.status === 'draft' && isOwner && (
            <Button size="sm" onClick={() => startMut.mutate()}>
              {t('assessments.start')}
            </Button>
          )}
          {(assessment.status === 'in_progress' || assessment.status === 'changes_requested') &&
            isOwner && (
              <Button size="sm" onClick={() => submitMut.mutate()}>
                {t('assessments.submitForReview')}
              </Button>
            )}
          {assessment.status === 'pending_review' && isApprover && (
            <>
              <Button size="sm" onClick={() => approveMut.mutate()}>
                {t('assessments.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!changesNote.trim()) return;
                  requestChangesMut.mutate(
                    { note: changesNote.trim() },
                    {
                      onSuccess: () => setChangesNote(''),
                    },
                  );
                }}
              >
                {t('assessments.requestChanges')}
              </Button>
            </>
          )}
          {assessment.status === 'approved' && isOwner && (
            <Button size="sm" onClick={() => completeMut.mutate()}>
              {t('assessments.complete')}
            </Button>
          )}
          {(assessment.status === 'draft' || assessment.status === 'completed') && isOwner && (
            <Button size="sm" variant="outline" onClick={() => archiveMut.mutate()}>
              {t('assessments.archive')}
            </Button>
          )}
        </div>
      </div>

      {assessment.status === 'pending_review' && isApprover && (
        <div className="mb-4">
          <Input
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            placeholder={t('assessments.changesNotePlaceholder')}
          />
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label={t('assessments.colCode')} value={assessment.assessmentCode} />
          <Field label={t('assessments.title')} value={assessment.title} />
          <Field label={t('assessments.type')} value={typeName} />
          <Field label={t('assessments.owner')} value={memberName(assessment.ownerId)} />
          <Field label={t('assessments.businessUnit')} value={assessment.businessUnit ?? ''} />
          <Field
            label={t('assessments.approver')}
            value={memberName(assessment.approverId)}
            action={
              canManage &&
              assessment.status !== 'approved' &&
              assessment.status !== 'completed' &&
              assessment.status !== 'archived' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setReassignOpen(true)}
                >
                  <UserCog size={13} />
                  <span className="sr-only">{t('assessments.reassignApprover')}</span>
                </Button>
              )
            }
          />
          <Field label={t('assessments.dueDate')} value={assessment.dueDate?.slice(0, 10) ?? ''} />
          <Field
            label={t('assessments.colStatus')}
            value={t(`assessments.status.${assessment.status}`)}
          />
          <Field
            label={t('assessments.colInherent')}
            value={
              assessment.highestInherentScore != null
                ? String(assessment.highestInherentScore)
                : '—'
            }
          />
          <Field
            label={t('assessments.colResidual')}
            value={
              assessment.highestResidualScore != null
                ? String(assessment.highestResidualScore)
                : '—'
            }
          />
          {assessment.lastReviewNote && (
            <div className="col-span-2">
              <Field label={t('assessments.lastReviewNote')} value={assessment.lastReviewNote} />
            </div>
          )}
        </div>
      )}

      {tab === 'items' && <AssessmentItemsPanel orgId={orgId} assessmentId={id} />}

      <ReassignDialog
        open={reassignOpen}
        isPending={reassignApproverMut.isPending}
        title={t('assessments.reassignApprover')}
        members={activeMembers.filter((m) => m.userId !== assessment.ownerId)}
        currentAssigneeId={assessment.approverId ?? ''}
        onOpenChange={setReassignOpen}
        onConfirm={(newApproverId) => {
          reassignApproverMut.mutate(
            { newApproverId },
            {
              onSuccess: () => setReassignOpen(false),
              onError: () => notify.error(t('error.unknown')),
            },
          );
        }}
      />
    </PageLayout>
  );
}

function Field({ label, value, action }: { label: string; value: string; action?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-foreground flex items-center gap-1">
        {value || '—'}
        {action}
      </div>
    </div>
  );
}
