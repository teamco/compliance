import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCog } from 'lucide-react';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { type Exception } from '@icore/shared';
import { effectiveExceptionStatus } from '@icore/shared/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useExceptionRenewals,
  useRequestExceptionRenewal,
  useReviewExceptionRenewal,
  useApproveException,
  useRejectException,
  useReassignExceptionOwner,
} from '@/queries/exceptions';
import { useRisks } from '@/queries/risks';
import { useOrgMembers } from '@/queries/org-members';
import { ReassignDialog } from '@/components/shared/ReassignDialog';

type DetailTab = 'overview' | 'renewal';

export function ExceptionDetailSheet({
  exception,
  orgId,
  open,
  onOpenChange,
}: {
  exception: Exception;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const notify = useNotify();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data: risks = [] } = useRisks(orgId);
  const { data: renewals = [] } = useExceptionRenewals(exception.id);
  const { data: members = [] } = useOrgMembers(orgId);
  // Renewal history can reference an owner who has since been removed from
  // the org; their name must still resolve, so this list stays separate from
  // `members` (active-only, used to compute `canManage` below).
  const { data: allMembers = [] } = useOrgMembers(orgId, { includeInactive: true });
  const myMembership = members.find((m) => m.userId === currentUserId);
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const requestMut = useRequestExceptionRenewal(orgId);
  const reviewMut = useReviewExceptionRenewal(orgId);
  const approveMut = useApproveException(orgId);
  const rejectMut = useRejectException(orgId);
  const reassignOwnerMut = useReassignExceptionOwner(orgId);

  const [tab, setTab] = useState<DetailTab>('overview');
  const [proposedExpiresAt, setProposedExpiresAt] = useState('');
  const [renewalJustification, setRenewalJustification] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);

  const status = effectiveExceptionStatus(exception);
  const linkedRisk = risks.find((r) => r.id === exception.riskId);
  const pendingRenewal = renewals.find((r) => r.status === 'pending');
  const isOwner = currentUserId === exception.ownerId;
  const isRenewalReviewer = !!pendingRenewal && pendingRenewal.requestedBy !== currentUserId;
  const canRequestRenewal =
    isOwner &&
    (status === 'approved' || status === 'expired') &&
    !pendingRenewal &&
    !!proposedExpiresAt &&
    !!renewalJustification;

  function resolveMemberName(userId: string): string {
    const member = allMembers.find((m) => m.userId === userId);
    return member?.displayName ?? member?.email ?? userId;
  }

  const tabs: DetailTab[] = ['overview', 'renewal'];

  function handleApprove() {
    approveMut.mutate(exception.id, {
      onSuccess: () => notify.success(t('exceptions.detail.approved')),
      onError: () => notify.error(t('error.unknown')),
    });
  }

  function handleReject() {
    rejectMut.mutate(exception.id, {
      onSuccess: () => notify.success(t('exceptions.detail.rejected')),
      onError: () => notify.error(t('error.unknown')),
    });
  }

  function handleRequestRenewal() {
    if (!canRequestRenewal) return;
    requestMut.mutate(
      { id: exception.id, data: { proposedExpiresAt, justification: renewalJustification } },
      {
        onSuccess: () => {
          notify.success(t('exceptions.detail.renewalRequested'));
          setProposedExpiresAt('');
          setRenewalJustification('');
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleApproveRenewal() {
    if (!pendingRenewal) return;
    reviewMut.mutate(
      { id: pendingRenewal.id, exceptionId: exception.id, decision: 'approved' },
      {
        onSuccess: () => notify.success(t('exceptions.detail.renewalApproved')),
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleRejectRenewal() {
    if (!pendingRenewal || !rejectNotes) return;
    reviewMut.mutate(
      {
        id: pendingRenewal.id,
        exceptionId: exception.id,
        decision: 'rejected',
        reviewNotes: rejectNotes,
      },
      {
        onSuccess: () => {
          notify.success(t('exceptions.detail.renewalRejected'));
          setRejectNotes('');
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{exception.title}</SheetTitle>
        </SheetHeader>

        <div className="border-b border-border flex gap-1 px-4">
          {tabs.map((tKey) => (
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
              {t(`exceptions.detail.tab.${tKey}`)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'overview' && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{exception.statement}</p>
              <p>
                {t('exceptions.justification')}: <span>{exception.justification}</span>
              </p>
              {exception.compensatingControls && (
                <p>
                  {t('exceptions.compensatingControls')}:{' '}
                  <span>{exception.compensatingControls}</span>
                </p>
              )}
              <p>
                {t('exceptions.detail.status')}: <strong>{t(`exceptions.status.${status}`)}</strong>
              </p>
              {exception.expiresAt && (
                <p>
                  {t('exceptions.detail.expiresAt')}:{' '}
                  <strong>{exception.expiresAt.slice(0, 10)}</strong>
                </p>
              )}
              <p>
                {t('exceptions.detail.linkedRisk')}:{' '}
                <strong>
                  {linkedRisk ? linkedRisk.title : t('exceptions.detail.noLinkedRisk')}
                </strong>
              </p>
              <p className="flex items-center gap-2">
                {t('exceptions.detail.owner')}:{' '}
                <strong>{resolveMemberName(exception.ownerId)}</strong>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setReassignOpen(true)}
                  >
                    <UserCog size={13} />
                    <span className="sr-only">{t('exceptions.detail.reassignOwner')}</span>
                  </Button>
                )}
              </p>
            </div>
          )}

          {tab === 'renewal' && (
            <div className="space-y-4">
              {pendingRenewal ? (
                <div className="border border-border rounded-lg p-3 space-y-2 text-sm">
                  <p>
                    {t('exceptions.detail.renewalPendingReview', {
                      date: pendingRenewal.proposedExpiresAt.slice(0, 10),
                    })}
                  </p>
                  <p className="text-muted-foreground">{pendingRenewal.justification}</p>
                  {isRenewalReviewer && (
                    <textarea
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder={t('exceptions.detail.rejectNotesPlaceholder')}
                      rows={2}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm resize-none"
                    />
                  )}
                </div>
              ) : (
                isOwner &&
                (status === 'approved' || status === 'expired') && (
                  <div className="space-y-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted-foreground">
                        {t('exceptions.detail.proposedExpiresAt')}
                      </span>
                      <input
                        type="date"
                        value={proposedExpiresAt}
                        onChange={(e) => setProposedExpiresAt(e.target.value)}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted-foreground">
                        {t('exceptions.detail.renewalJustification')}
                      </span>
                      <textarea
                        value={renewalJustification}
                        onChange={(e) => setRenewalJustification(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
                      />
                    </label>
                  </div>
                )
              )}

              {renewals.length > 0 && (
                <div className="pt-3 border-t border-border space-y-2">
                  <h3 className="text-xs text-muted-foreground">
                    {t('exceptions.detail.renewalHistory')}
                  </h3>
                  {renewals.map((r) => (
                    <div
                      key={r.id}
                      className="text-xs border border-border rounded p-2 space-y-0.5"
                    >
                      <p>
                        {t(`exceptions.detail.renewalHistoryStatus.${r.status}`)} —{' '}
                        {r.proposedExpiresAt.slice(0, 10)}
                      </p>
                      {r.reviewNotes && <p className="text-muted-foreground">{r.reviewNotes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-border p-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {tab === 'overview' && status === 'pending' && !isOwner && (
            <>
              <Button className="flex-1" onClick={handleApprove} disabled={approveMut.isPending}>
                {t('exceptions.approve')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleReject}
                disabled={rejectMut.isPending}
              >
                {t('exceptions.reject')}
              </Button>
            </>
          )}
          {tab === 'renewal' && !pendingRenewal && canRequestRenewal && (
            <Button
              className="flex-1"
              onClick={handleRequestRenewal}
              disabled={requestMut.isPending}
            >
              {t('exceptions.detail.requestRenewal')}
            </Button>
          )}
          {tab === 'renewal' && pendingRenewal && isRenewalReviewer && (
            <>
              <Button
                className="flex-1"
                onClick={handleApproveRenewal}
                disabled={reviewMut.isPending}
              >
                {t('exceptions.detail.approveRenewal')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleRejectRenewal}
                disabled={reviewMut.isPending || !rejectNotes}
              >
                {t('exceptions.detail.rejectRenewal')}
              </Button>
            </>
          )}
        </footer>
      </SheetContent>
      <ReassignDialog
        open={reassignOpen}
        isPending={reassignOwnerMut.isPending}
        title={t('exceptions.detail.reassignOwner')}
        members={members}
        currentAssigneeId={exception.ownerId}
        onOpenChange={setReassignOpen}
        onConfirm={(newOwnerId) => {
          reassignOwnerMut.mutate(
            { id: exception.id, newOwnerId },
            { onSuccess: () => setReassignOpen(false) },
          );
        }}
      />
    </Sheet>
  );
}
