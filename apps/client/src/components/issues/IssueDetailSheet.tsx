import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import type { Issue, RootCauseCategory } from '@icore/shared';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useIssueValidations,
  useSubmitIssueForValidation,
  useReviewIssueValidation,
} from '@/queries/issues';
import { useOrgMembers } from '@/queries/org-members';

const ROOT_CAUSE_CATEGORIES: RootCauseCategory[] = [
  'process_gap',
  'control_design_failure',
  'control_operating_failure',
  'human_error',
  'system_technical_failure',
  'third_party',
  'other',
];

type DetailTab = 'overview' | 'rootCause' | 'validation';

export function IssueDetailSheet({
  issue,
  orgId,
  open,
  onOpenChange,
}: {
  issue: Issue;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const notify = useNotify();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data: members = [] } = useOrgMembers(orgId);
  const { data: validations = [] } = useIssueValidations(issue.id);
  const submitMut = useSubmitIssueForValidation(orgId);
  const reviewMut = useReviewIssueValidation(orgId);

  const [tab, setTab] = useState<DetailTab>('overview');
  const [rootCause, setRootCause] = useState(issue.rootCause ?? '');
  const [rootCauseCategory, setRootCauseCategory] = useState<RootCauseCategory | ''>(
    issue.rootCauseCategory ?? '',
  );
  const [validatorId, setValidatorId] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');

  const pendingValidation = validations.find((v) => v.status === 'pending');
  const isOwner = currentUserId === issue.ownerId;
  const isAssignedValidator = pendingValidation?.validatorId === currentUserId;
  const canSubmit =
    isOwner &&
    (issue.status === 'open' || issue.status === 'in_progress') &&
    !!rootCause &&
    !!rootCauseCategory &&
    !!validatorId &&
    validatorId !== issue.ownerId;

  const validatorOptions = members
    .filter((m) => m.userId !== issue.ownerId)
    .map((m) => ({ value: m.userId, label: m.displayName ?? m.email ?? m.userId }));

  const tabs: DetailTab[] = ['overview', 'rootCause', 'validation'];

  function handleSubmit() {
    if (!canSubmit || !rootCauseCategory) return;
    submitMut.mutate(
      { id: issue.id, data: { rootCause, rootCauseCategory, validatorId } },
      {
        onSuccess: () => notify.success(t('issues.detail.submitted')),
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleApprove() {
    if (!pendingValidation) return;
    reviewMut.mutate(
      { id: pendingValidation.id, issueId: issue.id, decision: 'approved' },
      {
        onSuccess: () => notify.success(t('issues.detail.approved')),
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleReject() {
    if (!pendingValidation || !rejectNotes) return;
    reviewMut.mutate(
      {
        id: pendingValidation.id,
        issueId: issue.id,
        decision: 'rejected',
        reviewNotes: rejectNotes,
      },
      {
        onSuccess: () => {
          notify.success(t('issues.detail.rejected'));
          setRejectNotes('');
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{issue.title}</SheetTitle>
        </SheetHeader>

        <div className="border-b border-border mb-4 flex gap-1">
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
              {t(`issues.detail.tab.${tKey}`)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{issue.description}</p>
            <p>
              {t('issues.severity.label')}:{' '}
              <strong>{t(`issues.severity.${issue.severity}`)}</strong>
            </p>
            <p>
              {t('issues.detail.status')}: <strong>{t(`issues.status.${issue.status}`)}</strong>
            </p>
          </div>
        )}

        {tab === 'rootCause' && (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">
                {t('issues.detail.rootCauseCategory')}
              </span>
              <Select
                value={rootCauseCategory}
                onValueChange={(v) => setRootCauseCategory(v as RootCauseCategory)}
                disabled={!isOwner}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('issues.detail.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {ROOT_CAUSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`issues.detail.rootCauseCategoryOptions.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">{t('issues.detail.rootCause')}</span>
              <textarea
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                disabled={!isOwner}
                rows={4}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none disabled:opacity-50"
              />
            </label>
          </div>
        )}

        {tab === 'validation' && (
          <div className="space-y-4">
            {pendingValidation ? (
              <div className="border border-border rounded-lg p-3 space-y-2 text-sm">
                <p>
                  {t('issues.detail.pendingValidationFor', {
                    name:
                      members.find((m) => m.userId === pendingValidation.validatorId)
                        ?.displayName ?? pendingValidation.validatorId,
                  })}
                </p>
                {isAssignedValidator && (
                  <div className="space-y-2">
                    <textarea
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder={t('issues.detail.rejectNotesPlaceholder')}
                      rows={2}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleApprove} disabled={reviewMut.isPending}>
                        {t('issues.detail.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReject}
                        disabled={reviewMut.isPending || !rejectNotes}
                      >
                        {t('issues.detail.reject')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              isOwner &&
              (issue.status === 'open' || issue.status === 'in_progress') && (
                <div className="space-y-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">
                      {t('issues.detail.selectValidator')}
                    </span>
                    <Combobox
                      options={validatorOptions}
                      value={validatorId}
                      onChange={setValidatorId}
                      placeholder={t('issues.detail.selectValidator')}
                      searchPlaceholder={t('issues.searchMembers')}
                    />
                  </label>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitMut.isPending}
                  >
                    {t('issues.detail.submitForValidation')}
                  </Button>
                </div>
              )
            )}

            {validations.length > 0 && (
              <div className="pt-3 border-t border-border space-y-2">
                <h3 className="text-xs text-muted-foreground">{t('issues.detail.history')}</h3>
                {validations.map((v) => (
                  <div key={v.id} className="text-xs border border-border rounded p-2 space-y-0.5">
                    <p>
                      {t(`issues.detail.historyStatus.${v.status}`)} —{' '}
                      {members.find((m) => m.userId === v.validatorId)?.displayName ??
                        v.validatorId}
                    </p>
                    {v.reviewNotes && <p className="text-muted-foreground">{v.reviewNotes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
